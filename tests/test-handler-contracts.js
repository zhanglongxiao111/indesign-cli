import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const graphics = readFileSync(new URL('../src/handlers/graphicsHandlers.js', import.meta.url), 'utf8');
const exportTypes = readFileSync(new URL('../src/types/toolDefinitionsExport.js', import.meta.url), 'utf8');
const exportHandlers = readFileSync(new URL('../src/handlers/exportHandlers.js', import.meta.url), 'utf8');
const documentHandlers = readFileSync(new URL('../src/handlers/documentHandlers.js', import.meta.url), 'utf8');
const groupHandlers = readFileSync(new URL('../src/handlers/groupHandlers.js', import.meta.url), 'utf8');
const agentUxRunner = readFileSync(new URL('./real-e2e/run-agent-ux-hardening.mjs', import.meta.url), 'utf8');

assert.equal(graphics.includes('rectangle.cornerRadius'), false);
assert.equal(graphics.includes('rectangle.topLeftCornerRadius'), true);
assert.equal(graphics.includes('rectangle.topRightCornerRadius'), true);
assert.equal(graphics.includes('rectangle.bottomLeftCornerRadius'), true);
assert.equal(graphics.includes('rectangle.bottomRightCornerRadius'), true);
assert.equal(exportTypes.includes("'PNG'"), false);
assert.equal(exportTypes.includes("'TIFF'"), false);
assert.equal(exportHandlers.includes('ARTIFACT_FORMAT_UNSUPPORTED'), true);
assert.equal(documentHandlers.includes('DOCUMENT_TARGET_AMBIGUOUS'), true);
assert.equal(documentHandlers.includes('doc.close(SaveOptions.NO);'), false);
assert.equal(groupHandlers.includes('group.add(item);'), false);
assert.equal(groupHandlers.includes('page.groups.add(groupItems);'), true);
assert.equal(agentUxRunner.includes('expectedCode'), true);
assert.equal(agentUxRunner.includes('ARTIFACT_FORMAT_UNSUPPORTED'), true);
assert.equal(agentUxRunner.includes('INDESIGN_SCRIPT_FAILED'), true);
assert.equal(agentUxRunner.includes('BATCH_STEP_FAILED'), true);
assert.equal(agentUxRunner.includes('failed_step'), true);

console.log('handler contract tests passed');
