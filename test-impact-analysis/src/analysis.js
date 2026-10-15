import { parse } from 'acorn';
import { full, fullAncestor } from 'acorn-walk';
import { posix } from 'node:path';

export const quote = value => `'${String(value).replaceAll("'", "'\\''")}'`;
const id = (module, name) => `${module}#${name}`;
const sorted = values => values.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b), 'en'));

export function parseModule(code, module = '') {
  const result = { functions: new Map(), imports: new Map(), exports: new Map(), outside: '', issues: [] };
  const ast = parse(code, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
  for (const statement of ast.body) {
    const node = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
    if (node?.type === 'FunctionDeclaration' && node.id) {
      result.functions.set(node.id.name, { node, text: code.slice(node.start, node.end) });
      if (statement.type === 'ExportNamedDeclaration') result.exports.set(node.id.name, node.id.name);
    } else {
      result.outside += code.slice(statement.start, statement.end) + '\n';
    }
    if (statement.type === 'ImportDeclaration') {
      for (const spec of statement.specifiers) {
        if (spec.type === 'ImportSpecifier') result.imports.set(spec.local.name, {
          source: statement.source.value, name: spec.imported.name ?? spec.imported.value,
        });
      }
    }
    if (statement.type === 'ExportNamedDeclaration' && !statement.source) {
      for (const spec of statement.specifiers) result.exports.set(spec.exported.name, spec.local.name);
    }
    if (statement.type === 'ExportAllDeclaration' || statement.source && statement.type.startsWith('Export')) {
      result.issues.push('re-export cannot be resolved safely');
    }
  }
  full(ast, node => {
    if (node.type === 'ImportExpression') result.issues.push('dynamic import cannot be resolved safely');
  });
  fullAncestor(ast, (node, _state, ancestors) => {
    if (node.type !== 'CallExpression') return;
    const owner = ancestors.slice(0, -1).reverse().find(n => /Function/.test(n.type));
    const entry = [...result.functions.values()].find(f => f.node === owner);
    if (!entry) {
      result.issues.push(`call outside a supported named function at line ${node.loc.start.line}`);
      return;
    }
    (entry.calls ??= []).push(node);
  });
  return result;
}

export function functionRanges(code) {
  const ast = parse(code || '', { ecmaVersion: 'latest', sourceType: 'module', locations: true });
  const ranges = [];
  full(ast, node => {
    if (node.type === 'FunctionDeclaration' && node.id) ranges.push({ name: node.id.name,
      startLine: node.loc.start.line, endLine: node.loc.end.line });
  });
  return ranges.sort((a, b) => a.startLine - b.startLine);
}

export function compareModules(changedFiles, read) {
  const changedFunctions = [], uncertainAreas = [];
  for (const module of changedFiles) {
    let base, head;
    try {
      base = parseModule(read('base', module) ?? '', module);
      head = parseModule(read('head', module) ?? '', module);
    } catch (error) {
      uncertainAreas.push({ module, reason: `JavaScript parse failed: ${error.message}` });
      continue;
    }
    for (const name of new Set([...base.functions.keys(), ...head.functions.keys()])) {
      const before = base.functions.get(name), after = head.functions.get(name);
      if (before?.text !== after?.text) changedFunctions.push({ module, name,
        changeType: !before ? 'added' : !after ? 'removed' : 'modified' });
    }
    if (base.outside !== head.outside) uncertainAreas.push({ module, reason: 'changed statement outside a named function' });
  }
  return { changedFunctions: sorted(changedFunctions), uncertainAreas: sorted(uncertainAreas) };
}

export function mapCallers(modules, changedFunctions) {
  const reverse = new Map(), identities = new Map(), uncertainAreas = [];
  const uncertain = (module, reason) => uncertainAreas.push({ module, reason });
  for (const [module, data] of modules) {
    for (const reason of data.issues) uncertain(module, reason);
    for (const [name, fn] of data.functions) {
      const caller = id(module, name);
      identities.set(caller, { module, name });
      // Parameters and local bindings can shadow module-level functions/imports.
      // Conservatively reject such names rather than inventing a call edge.
      const shadowed = new Set();
      const bindings = pattern => {
        if (!pattern) return;
        if (pattern.type === 'Identifier') shadowed.add(pattern.name);
        else if (pattern.type === 'RestElement') bindings(pattern.argument);
        else if (pattern.type === 'AssignmentPattern') bindings(pattern.left);
        else if (pattern.type === 'ArrayPattern') pattern.elements.forEach(bindings);
        else if (pattern.type === 'ObjectPattern') pattern.properties.forEach(p => bindings(p.value ?? p.argument));
      };
      fn.node.params.forEach(bindings);
      full(fn.node.body, node => {
        if (node.type === 'VariableDeclarator') bindings(node.id);
        if (node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') bindings(node.id);
        if (node.type === 'CatchClause') bindings(node.param);
        if (node.type === 'AssignmentExpression' || node.type === 'UpdateExpression') bindings(node.left ?? node.argument);
      });
      for (const call of fn.calls ?? []) {
        let target;
        const callee = call.callee;
        if (callee.type === 'Identifier' && !shadowed.has(callee.name)) {
          if (data.functions.has(callee.name)) target = id(module, callee.name);
          else if (data.imports.has(callee.name)) {
            const imported = data.imports.get(callee.name);
            const path = posix.normalize(posix.join(posix.dirname(module), imported.source));
            const importedModule = imported.source.startsWith('.') ? modules.get(path) : null;
            const exported = importedModule?.exports.get(imported.name);
            if (exported && importedModule.functions.has(exported)) target = id(path, exported);
          }
        }
        if (!target) {
          uncertain(module, `unresolved call in ${name} at line ${call.loc.start.line}`);
          continue;
        }
        if (!reverse.has(target)) reverse.set(target, new Set());
        reverse.get(target).add(caller);
      }
    }
  }
  const impactedFunctions = [];
  for (const change of changedFunctions) {
    const root = id(change.module, change.name);
    if (change.changeType === 'removed') {
      uncertain(change.module, `removed function ${change.name}: callers cannot be resolved at the head commit`);
      continue;
    }
    const queue = [[root]], seen = new Set([root]);
    for (let i = 0; i < queue.length; i++) {
      const path = queue[i];
      for (const caller of [...(reverse.get(path[0]) ?? [])].sort()) {
        if (seen.has(caller)) continue;
        seen.add(caller);
        const next = [caller, ...path];
        impactedFunctions.push({ ...identities.get(caller), path: next.join(' → '),
          callPath: next.map(key => identities.get(key) ?? { module: change.module, name: change.name }) });
        queue.push(next);
      }
    }
  }
  return { impactedFunctions: sorted(impactedFunctions), uncertainAreas: sorted(uncertainAreas) };
}
