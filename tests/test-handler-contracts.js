import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registry } from '../src/tools/index.js';

const graphics = readFileSync(new URL('../src/tools/graphics/shapes.js', import.meta.url), 'utf8');
const exportOperations = readFileSync(new URL('../src/tools/export/operations.js', import.meta.url), 'utf8');
const documentLifecycle = readFileSync(new URL('../src/tools/document/lifecycle.js', import.meta.url), 'utf8');
const groupMembership = readFileSync(new URL('../src/tools/group/membership.js', import.meta.url), 'utf8');
const agentUxRunner = readFileSync(new URL('./real-e2e/run-agent-ux-hardening.mjs', import.meta.url), 'utf8');

const exportImages = registry.byName.get('export_images');
assert.ok(exportImages, 'export_images must be registered');
assert.deepEqual(exportImages.inputSchema.properties.format.enum, ['JPEG']);
assert.equal(graphics.includes('rectangle.cornerRadius'), false);
assert.equal(graphics.includes('rectangle.topLeftCornerRadius'), true);
assert.equal(graphics.includes('rectangle.topRightCornerRadius'), true);
assert.equal(graphics.includes('rectangle.bottomLeftCornerRadius'), true);
assert.equal(graphics.includes('rectangle.bottomRightCornerRadius'), true);
assert.equal(exportOperations.includes('ARTIFACT_FORMAT_UNSUPPORTED'), true);
assert.equal(documentLifecycle.includes('DOCUMENT_TARGET_AMBIGUOUS'), true);
assert.equal(documentLifecycle.includes('doc.close(SaveOptions.NO);'), false);
assert.equal(groupMembership.includes('group.add(item);'), false);
assert.equal(groupMembership.includes('page.groups.add(groupItems);'), true);
assert.equal(groupMembership.includes('if (item.id === group.id)'), true);
assert.equal(groupMembership.includes('Cannot add a group to itself'), true);
assert.equal(agentUxRunner.includes('expectedCode'), true);
assert.equal(agentUxRunner.includes('ARTIFACT_FORMAT_UNSUPPORTED'), true);
assert.equal(agentUxRunner.includes('INDESIGN_SCRIPT_FAILED'), true);
assert.equal(agentUxRunner.includes('BATCH_STEP_FAILED'), true);
assert.equal(agentUxRunner.includes('failed_step'), true);

console.log('registry contract tests passed');
