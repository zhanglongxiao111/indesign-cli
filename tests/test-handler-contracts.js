import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { registry } from '../src/tools/index.js';
import { ScriptExecutor } from '../src/core/scriptExecutor.js';
import { sessionManager } from '../src/core/sessionManager.js';
import { openDocument } from '../src/tools/document/lifecycle.js';

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

function createFakeFileFactory(existingPaths = new Set()) {
  const normalize = (p) => String(p || '').replace(/\\/g, '/').replace(/^\/\/+/, '//').toLowerCase();
  const normalizedExisting = new Set([...existingPaths].map(normalize));
  return function FakeFile(input) {
    if (input && typeof input === 'object' && input.__isFakeFile) {
      return input;
    }
    const raw = String(input || '');
    const slashPath = raw.replace(/\\/g, '/');
    const winPath = slashPath.startsWith('//')
      ? '\\\\' + slashPath.slice(2).replace(/\//g, '\\')
      : slashPath.replace(/\//g, '\\');
    return {
      __isFakeFile: true,
      fsName: winPath,
      fullName: slashPath,
      exists: normalizedExisting.has(normalize(slashPath)),
    };
  };
}

async function runOpenDocumentWithFakeApp(app, existingPaths, args) {
  const originalExec = ScriptExecutor.executeInDesignScript;
  const FakeFile = createFakeFileFactory(existingPaths);
  ScriptExecutor.executeInDesignScript = async (script) => {
    const result = vm.runInNewContext(script, { app, File: FakeFile, JSON });
    return result === undefined || result === null ? '' : String(result);
  };
  try {
    return await openDocument(args);
  } finally {
    ScriptExecutor.executeInDesignScript = originalExec;
  }
}

// 1) Already-open document on UNC path activates without calling app.open (prevents lock/permission error).
{
  const FakeFile = createFakeFileFactory(['//nas/proj/ref.indd', '//nas/proj/editable_v2.indd']);
  const refDoc = {
    name: 'ref.indd',
    fullName: FakeFile('//nas/proj/ref.indd'),
    pages: { length: 10 },
    windows: [{}],
    documentPreferences: { pageWidth: 210, pageHeight: 297 },
  };
  const editableDoc = {
    name: 'editable_v2.indd',
    fullName: FakeFile('//nas/proj/editable_v2.indd'),
    pages: { length: 15 },
    windows: [{}],
    documentPreferences: { pageWidth: 297, pageHeight: 210 },
  };
  const fakeApp = {
    documents: [refDoc, editableDoc],
    activeDocument: refDoc,
    open() {
      throw new Error('您没有权限或该文档已打开。');
    },
  };
  sessionManager.clearSession();
  const res = await runOpenDocumentWithFakeApp(
    fakeApp,
    ['//nas/proj/ref.indd', '//nas/proj/editable_v2.indd'],
    { filePath: '\\\\NAS\\proj\\editable_v2.indd' }
  );
  assert.equal(res.success, true);
  assert.equal(fakeApp.activeDocument, editableDoc);
  assert.equal(res.data.alreadyOpen, true);
  assert.equal(res.data.documentName, 'editable_v2.indd');
  assert.equal(res.documentState.activeDocumentName, 'editable_v2.indd');
  assert.equal(sessionManager.getActiveDocument().name, 'editable_v2.indd');
}

// 2) Unopened existing document opens and becomes active.
{
  const FakeFile = createFakeFileFactory(['D:/work/new_deck.indd']);
  let openedCount = 0;
  const fakeApp = {
    documents: [],
    activeDocument: null,
    open(file) {
      openedCount += 1;
      const doc = {
        name: 'new_deck.indd',
        fullName: file,
        pages: { length: 8 },
        windows: [{}],
        documentPreferences: { pageWidth: 420, pageHeight: 297 },
      };
      this.documents.push(doc);
      this.activeDocument = doc;
      return doc;
    },
  };
  const res = await runOpenDocumentWithFakeApp(fakeApp, ['D:/work/new_deck.indd'], { filePath: 'D:\\work\\new_deck.indd' });
  assert.equal(res.success, true);
  assert.equal(openedCount, 1);
  assert.equal(res.data.alreadyOpen, false);
  assert.equal(res.result.includes('Document opened:'), true);
}

// 3) Missing file returns structured failure instead of false success.
{
  const fakeApp = { documents: [], activeDocument: null, open() { throw new Error('unexpected'); } };
  const res = await runOpenDocumentWithFakeApp(fakeApp, [], { filePath: 'D:\\work\\missing.indd' });
  assert.equal(res.success, false);
  assert.equal(res.code, 'FILE_NOT_FOUND');
}

// 4) Real app.open error returns structured DOCUMENT_OPEN_FAILED.
{
  const fakeApp = {
    documents: [],
    activeDocument: null,
    open() {
      throw new Error('Corrupted file');
    },
  };
  const res = await runOpenDocumentWithFakeApp(fakeApp, ['D:/work/bad.indd'], { filePath: 'D:\\work\\bad.indd' });
  assert.equal(res.success, false);
  assert.equal(res.code, 'DOCUMENT_OPEN_FAILED');
  assert.equal(res.message.includes('Corrupted file'), true);
}

// 5) Same basename in different directories must NOT report success if activation fails and stays on the other file.
{
  const FakeFile = createFakeFileFactory(['C:/a/deck.indd', 'C:/b/deck.indd']);
  const docA = {
    id: 101,
    name: 'deck.indd',
    fullName: FakeFile('C:/a/deck.indd'),
    pages: { length: 4 },
    windows: [{}],
    documentPreferences: { pageWidth: 210, pageHeight: 297 },
  };
  const docB = {
    id: 202,
    name: 'deck.indd',
    fullName: FakeFile('C:/b/deck.indd'),
    pages: { length: 12 },
    windows: [],
    documentPreferences: { pageWidth: 297, pageHeight: 210 },
  };
  let currentActive = docA;
  const fakeApp = {
    documents: [docA, docB],
    get activeDocument() {
      return currentActive;
    },
    set activeDocument(_next) {
      throw new Error('Cannot activate headless document');
    },
    open() {
      throw new Error('Should not call app.open');
    },
  };
  sessionManager.clearSession();
  const res = await runOpenDocumentWithFakeApp(
    fakeApp,
    ['C:/a/deck.indd', 'C:/b/deck.indd'],
    { filePath: 'C:\\b\\deck.indd' }
  );
  assert.equal(res.success, false);
  assert.equal(res.code, 'DOCUMENT_ACTIVATE_FAILED');
  assert.equal(sessionManager.getActiveDocument(), null);
}

console.log('registry contract tests passed');
