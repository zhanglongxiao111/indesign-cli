import { registry } from '../src/tools/index.js';

const seenNames = new Map();
const seenCliIds = new Map();
const dups = [];
for (const t of registry.tools) {
  if (!t?.name) continue;
  if (seenNames.has(t.name)) dups.push(`name:${t.name}`);
  else seenNames.set(t.name, true);
  if (seenCliIds.has(t.cli?.id)) dups.push(`cli.id:${t.cli.id}`);
  else seenCliIds.set(t.cli?.id, true);
}
if (dups.length) {
  console.log('Duplicate registry entries:', Array.from(new Set(dups)).join(', '));
  process.exit(1);
} else {
  console.log('No duplicate tool names or cli.ids found.');
}
