import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { prepareDArtifactPublish } from '../../scripts/migration/record_golden.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const goldenDir = path.join(
  repoRoot,
  'docs',
  'AI协作',
  '本地Agent',
  '进行中',
  '2026-07-06_终态重构',
  'golden',
);

async function readGoldenJson(name) {
  return JSON.parse(await fs.readFile(path.join(goldenDir, name), 'utf8'));
}

test('D golden evidence is backed by normalized raw runner reports', async () => {
  const summary = await readGoldenJson('D_architecture_presentation_catalog_summary.json');
  assert.equal(summary.total, 150);
  assert.equal(summary.bySource?.['cli.primitive'], 1);

  const evidence = await readGoldenJson('D_architecture_presentation_catalog_evidence.json');
  assert.equal(evidence.summary.total, summary.total);
  assert.equal(evidence.summary.bySource?.['cli.primitive'], summary.bySource['cli.primitive']);
  assert.equal(evidence.containsFeedbackReport, true);
  assert.equal(evidence.feedbackReport?.tool_id, 'feedback.report');
  assert.equal(evidence.feedbackReport?.source, 'cli.primitive');
  assert.ok(!JSON.stringify(evidence).includes('actualRunId'));
});

test('D artifact publish clears old success and failure evidence before runner execution', async (t) => {
  const tempDir = await fs.mkdtemp(path.join(repoRoot, '.indesign-cli', 'record-golden-test-'));
  t.after(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  await fs.writeFile(path.join(tempDir, 'D_runner_outputs.json'), '{}\n', 'utf8');
  await fs.writeFile(path.join(tempDir, 'D_architecture_presentation_catalog_summary.json'), '{}\n', 'utf8');
  await fs.writeFile(path.join(tempDir, 'D_architecture_presentation_catalog_evidence.json'), '{}\n', 'utf8');
  await fs.writeFile(path.join(tempDir, 'D_architecture_presentation_full_offline.json'), '{}\n', 'utf8');

  await prepareDArtifactPublish(tempDir);

  await assert.rejects(fs.access(path.join(tempDir, 'D_runner_outputs.json')), { code: 'ENOENT' });
  await assert.rejects(fs.access(path.join(tempDir, 'D_architecture_presentation_catalog_summary.json')), { code: 'ENOENT' });
  await assert.rejects(fs.access(path.join(tempDir, 'D_architecture_presentation_catalog_evidence.json')), { code: 'ENOENT' });
  await assert.rejects(fs.access(path.join(tempDir, 'D_architecture_presentation_full_offline.json')), { code: 'ENOENT' });
});
