import { parse } from 'acorn';
import { full } from 'acorn-walk';
import { posix } from 'node:path';

const order = (a, b) => `${a.file}:${a.line}:${a.name}`.localeCompare(`${b.file}:${b.line}:${b.name}`, 'en');
const identity = ({ module, name }) => `${module}#${name}`;

export function isTestFile(file) {
  return file.endsWith('.test.js') || file.endsWith('.spec.js');
}

function importedModule(file, source) {
  return posix.normalize(posix.join(posix.dirname(file), source));
}

export function discoverTestCases(files, read) {
  const cases = [], discoveryIssues = [];
  for (const file of files.filter(isTestFile).sort()) {
    let ast;
    try {
      ast = parse(read(file), { ecmaVersion: 'latest', sourceType: 'module', locations: true });
    } catch (error) {
      discoveryIssues.push({ file, reason: `test file could not be parsed: ${error.message}` });
      continue;
    }
    const imports = new Map();
    const testNames = new Set();
    const helpers = new Map();
    for (const statement of ast.body) {
      if (statement.type === 'FunctionDeclaration' && statement.id) helpers.set(statement.id.name, statement.body);
      if (statement.type === 'VariableDeclaration') {
        for (const declaration of statement.declarations) {
          if (declaration.id.type === 'Identifier' && ['ArrowFunctionExpression', 'FunctionExpression'].includes(declaration.init?.type)) {
            helpers.set(declaration.id.name, declaration.init.body);
          }
        }
      }
      if (statement.type !== 'ImportDeclaration') continue;
      const source = statement.source.value;
      for (const spec of statement.specifiers) {
        if (source === 'node:test') {
          if (spec.type === 'ImportDefaultSpecifier' || spec.type === 'ImportSpecifier' && (spec.imported.name ?? spec.imported.value) === 'test') testNames.add(spec.local.name);
        } else if (source.startsWith('.') && spec.type === 'ImportSpecifier') {
          imports.set(spec.local.name, { module: importedModule(file, source), name: spec.imported.name ?? spec.imported.value });
        }
      }
    }
    full(ast, node => {
      if (node.type !== 'CallExpression') return;
      const callee = node.callee;
      const isTest = callee.type === 'Identifier' && testNames.has(callee.name)
        || callee.type === 'MemberExpression' && !callee.computed && callee.object.type === 'Identifier'
          && testNames.has(callee.object.name) && ['only', 'skip', 'todo'].includes(callee.property.name);
      if (!isTest) return;
      const [title, callback] = node.arguments;
      const name = title?.type === 'Literal' && typeof title.value === 'string' ? title.value : `case at line ${node.loc.start.line}`;
      const entry = { file, line: node.loc.start.line, name, imports: [...imports.values()], calls: [], issues: [] };
      if (title?.type !== 'Literal' || typeof title.value !== 'string') entry.issues.push('case name is computed');
      if (!callback || !['ArrowFunctionExpression', 'FunctionExpression'].includes(callback.type)) {
        entry.issues.push('test callback cannot be analyzed');
      } else {
        const seenHelpers = new Set();
        const scan = body => full(body, inner => {
          if (inner.type !== 'CallExpression' && inner.type !== 'NewExpression') return;
          const target = inner.callee;
          if (target.type === 'Identifier' && imports.has(target.name)) entry.calls.push(imports.get(target.name));
          else if (target.type === 'Identifier' && helpers.has(target.name) && !seenHelpers.has(target.name)) {
            seenHelpers.add(target.name);
            scan(helpers.get(target.name));
          } else if (target.type === 'MemberExpression' && target.computed) entry.issues.push(`computed call at line ${inner.loc.start.line}`);
        });
        scan(callback.body);
      }
      cases.push(entry);
    });
  }
  return { cases: cases.sort(order), discoveryIssues };
}

export function selectTests({ cases, discoveryIssues }, impactMap, exportsByModule = new Map()) {
  const affected = new Map();
  for (const fn of impactMap.changedFunctions) if (fn.changeType !== 'removed') affected.set(identity(fn), [fn]);
  for (const fn of impactMap.impactedFunctions) affected.set(identity(fn), fn.callPath);
  const uncertainByModule = new Map();
  for (const area of impactMap.uncertainAreas) {
    if (!uncertainByModule.has(area.module)) uncertainByModule.set(area.module, []);
    uncertainByModule.get(area.module).push(area.reason);
  }
  const testCases = cases.map(item => {
    const links = [];
    for (const call of item.calls) {
      const exported = exportsByModule.get(call.module);
      const resolved = { ...call, name: exported?.get(call.name) ?? call.name };
      const path = affected.get(identity(resolved));
      if (path) links.push({ function: resolved, callPath: path });
    }
    const uniqueLinks = [...new Map(links.map(link => [identity(link.function), link])).values()]
      .sort((a, b) => identity(a.function).localeCompare(identity(b.function), 'en'));
    const reasons = impactMap.changedFiles.length ? [...item.issues] : [];
    for (const call of item.calls) {
      const exported = exportsByModule.get(call.module);
      if (impactMap.changedFiles.length && (!exported || !exported.has(call.name))) {
        reasons.push(`${call.module}#${call.name}: imported call could not be resolved to a production export`);
      }
      const resolvedName = exported?.get(call.name) ?? call.name;
      for (const reason of uncertainByModule.get(call.module) ?? []) {
        const moduleWide = reason.startsWith('changed statement outside a named function')
          || reason.startsWith('JavaScript parse failed') || reason.startsWith('dynamic import');
        const functionSpecific = reason.startsWith(`unresolved call in ${resolvedName} at `)
          || reason.startsWith(`removed function ${resolvedName}:`);
        if (moduleWide || functionSpecific) reasons.push(`${call.module}: ${reason}`);
      }
    }
    const uniqueReasons = [...new Set(reasons)].sort();
    const status = uniqueLinks.length ? 'linked' : uniqueReasons.length ? 'uncertain' : 'excluded';
    return {
      file: item.file, line: item.line, name: item.name, status, recommended: status !== 'excluded',
      links: uniqueLinks, reasons: status === 'excluded' ? ['no call to a changed or impacted function was found'] : uniqueReasons,
    };
  });
  return { testCases, testDiscoveryIssues: discoveryIssues };
}
