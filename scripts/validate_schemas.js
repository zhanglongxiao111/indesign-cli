import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const typesIndex = pathToFileURL(path.join(__dirname, '..', 'src', 'types', 'index.js')).href;
  const mod = await import(typesIndex);
  const tools = mod.allToolDefinitions || [];
  const problems = [];

  for (const t of tools) {
    if (!t || typeof t !== 'object') continue;
    const schema = t.inputSchema;
    if (!schema) continue;
    if (schema && schema.type === 'object') {
      if (!Object.prototype.hasOwnProperty.call(schema, 'additionalProperties')) {
        problems.push({ name: t.name, reason: 'missing additionalProperties', schema });
      }
    }
  }

  if (problems.length) {
    console.log(`Found ${problems.length} object schemas missing additionalProperties:`);
    for (const p of problems) {
      console.log(` - ${p.name}`);
    }
    process.exitCode = 1;
  } else {
    console.log('All object schemas include additionalProperties.');
  }
}

main().catch((e) => {
  console.error('Validation script error:', e);
  process.exit(2);
});

