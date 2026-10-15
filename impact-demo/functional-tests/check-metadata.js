import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('.', import.meta.url));
const catalog = JSON.parse(readFileSync(join(directory, 'test-cases.json'), 'utf8'));
const actual = new Set();
for (const file of readdirSync(directory).filter(name => name.endsWith('.test.js'))) {
  const source = readFileSync(join(directory, file), 'utf8');
  for (const match of source.matchAll(/^test\('([^']+)'/gm)) actual.add(`${file}:${match[1]}`);
}

const ids = new Set();
const listed = new Set();
for (const item of catalog) {
  if (!item.id || !item.file || !item.title || !item.description?.trim())
    throw new Error('Every test needs an ID, file, title, and description.');
  if (ids.has(item.id)) throw new Error(`Duplicate test ID: ${item.id}`);
  ids.add(item.id);
  const key = `${item.file}:${item.title}`;
  if (listed.has(key)) throw new Error(`Duplicate test metadata: ${key}`);
  listed.add(key);
}

const missing = [...actual].filter(key => !listed.has(key));
const stale = [...listed].filter(key => !actual.has(key));
if (missing.length || stale.length)
  throw new Error(`Test metadata is out of sync. Missing: ${missing.join(', ') || 'none'}. Stale: ${stale.join(', ') || 'none'}.`);

console.log(`Metadata verified for ${catalog.length} tests.`);
