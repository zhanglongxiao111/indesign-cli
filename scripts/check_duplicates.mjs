import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const typesUrl = pathToFileURL(path.join(__dirname, '..', 'src', 'types', 'index.js')).href;
const { allToolDefinitions } = await import(typesUrl);
const seen = new Map();
const dups = [];
for (const t of allToolDefinitions) {
  if (!t?.name) continue;
  const k = t.name;
  if (seen.has(k)) dups.push(k);
  else seen.set(k, true);
}
if (dups.length) {
  console.log('Duplicate tool names:', Array.from(new Set(dups)).join(', '));
  process.exit(1);
} else {
  console.log('No duplicate tool names found.');
}
