#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const reportPath = process.argv[2];
if (!reportPath) {
  console.error('Usage: node tests/real-e2e/validators/validate-coverage.mjs <coverage-report.json>');
  process.exit(2);
}

const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
if (!report.summary || !Array.isArray(report.tools)) {
  throw new Error('coverage report must contain summary and tools[]');
}

const ids = new Set();
for (const tool of report.tools) {
  for (const key of ['tool_id', 'source', 'backend', 'scenario', 'status', 'call_sequence', 'artifact_paths', 'audit_refs']) {
    if (!(key in tool)) {
      throw new Error(`tool entry missing ${key}: ${tool.tool_id || '<unknown>'}`);
    }
  }
  if (ids.has(tool.tool_id)) {
    throw new Error(`duplicate tool_id in coverage report: ${tool.tool_id}`);
  }
  ids.add(tool.tool_id);
}

if (report.summary.ability_total !== ids.size) {
  throw new Error(`summary ability_total ${report.summary.ability_total} does not match unique tool count ${ids.size}`);
}

console.log(JSON.stringify({
  ok: true,
  report: path.resolve(reportPath),
  ability_total: report.summary.ability_total,
  pending: report.summary.pending || 0,
}, null, 2));
