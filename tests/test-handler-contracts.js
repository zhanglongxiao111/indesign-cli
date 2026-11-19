import assert from 'node:assert/strict';
import fs, { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { registry } from '../src/tools/index.js';
import {
  DEFAULT_COM_PROG_IDS,
  EXTENDSCRIPT_RUNTIME_SNIPPET,
  ScriptExecutor
} from '../src/core/scriptExecutor.js';
import { runScript } from '../src/core/runtime.js';
import { sessionManager } from '../src/core/sessionManager.js';
import { openDocument } from '../src/tools/document/lifecycle.js';
import { createTable, populateTable } from '../src/tools/text/tables.js';
import { populateTemplateSlots } from '../src/tools/template/population.js';
import {
  addCoverPage,
  addFullBleedImage,
  addImageGrid,
  addSectionPage
} from '../src/tools/presentation/slides.js';

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

// 6) ScriptExecutor.buildWrappedScript: disableRedraw + fastUndo wrapping, restoration on success/error, and default behavior.
{
  const UserInteractionLevels = { NEVER_INTERACT: 1699640946 };
  const ScriptLanguage = { JAVASCRIPT: 1246973031 };
  const UndoModes = { ENTIRE_SCRIPT: 1699963733 };

  // 6a) disableRedraw + fastUndo success path
  {
    const doScriptCalls = [];
    let redrawInsideScript = null;
    const fakeApp = {
      scriptPreferences: { userInteractionLevel: null, enableRedraw: true },
      doScript(code, lang, args, undoMode, undoName) {
        doScriptCalls.push({ code, lang, args, undoMode, undoName });
        return vm.runInContext(code, ctx);
      },
    };
    const ctx = vm.createContext({
      app: fakeApp,
      UserInteractionLevels,
      ScriptLanguage,
      UndoModes,
      recordRedraw(v) { redrawInsideScript = v; },
    });
    const wrapped = ScriptExecutor.buildWrappedScript(
      'recordRedraw(app.scriptPreferences.enableRedraw); "ok-fast-undo";',
      { disableRedraw: true, fastUndo: true, undoName: 'Batch Populate' }
    );
    assert.equal(wrapped.includes('enableRedraw = false'), true);
    assert.equal(wrapped.includes('finally'), true);
    assert.equal(wrapped.includes('UndoModes.ENTIRE_SCRIPT'), true);
    assert.equal(wrapped.includes('UndoModes.FAST_ENTIRE_SCRIPT'), false);
    const out = vm.runInContext(wrapped, ctx);
    assert.equal(out, 'ok-fast-undo');
    assert.equal(redrawInsideScript, false);
    assert.equal(fakeApp.scriptPreferences.enableRedraw, true);
    assert.equal(doScriptCalls.length, 1);
    assert.equal(doScriptCalls[0].lang, ScriptLanguage.JAVASCRIPT);
    assert.equal(doScriptCalls[0].args, undefined);
    assert.equal(doScriptCalls[0].undoMode, UndoModes.ENTIRE_SCRIPT);
    assert.equal(doScriptCalls[0].undoName, 'Batch Populate');
  }

  // 6b) disableRedraw restores enableRedraw even when script throws (and preserves prior false state)
  {
    const fakeApp = { scriptPreferences: { userInteractionLevel: null, enableRedraw: true } };
    const ctx = vm.createContext({ app: fakeApp, UserInteractionLevels });
    const wrapped = ScriptExecutor.buildWrappedScript(
      'throw new Error("boom inside redraw");',
      { disableRedraw: true }
    );
    const out = vm.runInContext(wrapped, ctx);
    assert.equal(out, 'Error: boom inside redraw');
    assert.equal(fakeApp.scriptPreferences.enableRedraw, true);
  }
  {
    const fakeApp = { scriptPreferences: { userInteractionLevel: null, enableRedraw: false } };
    const ctx = vm.createContext({ app: fakeApp, UserInteractionLevels });
    const wrapped = ScriptExecutor.buildWrappedScript('"still-false";', { disableRedraw: true });
    const out = vm.runInContext(wrapped, ctx);
    assert.equal(out, 'still-false');
    assert.equal(fakeApp.scriptPreferences.enableRedraw, false);
  }

  // 6c) Default options do not alter enableRedraw or use UndoModes.ENTIRE_SCRIPT
  {
    const wrappedDefault = ScriptExecutor.buildWrappedScript('"plain";');
    assert.equal(wrappedDefault.includes('enableRedraw'), false);
    assert.equal(wrappedDefault.includes('UndoModes.ENTIRE_SCRIPT'), false);
    const fakeApp = { scriptPreferences: { userInteractionLevel: null, enableRedraw: true } };
    const out = vm.runInNewContext(wrappedDefault, { app: fakeApp, UserInteractionLevels });
    assert.equal(out, 'plain');
    assert.equal(fakeApp.scriptPreferences.enableRedraw, true);
  }

  // 6d) runScript forwards options to ScriptExecutor.executeInDesignScript, and Windows path passes wrapped script to DoScript
  {
    const originalExec = ScriptExecutor.executeInDesignScript;
    let captured = null;
    ScriptExecutor.executeInDesignScript = async (script, options) => {
      captured = { script, options };
      return 'forwarded';
    };
    try {
      const res = await runScript('"x";', { disableRedraw: true, fastUndo: true, undoName: 'My Undo' });
      assert.equal(res, 'forwarded');
      assert.deepEqual(captured, {
        script: '"x";',
        options: { disableRedraw: true, fastUndo: true, undoName: 'My Undo' }
      });
    } finally {
      ScriptExecutor.executeInDesignScript = originalExec;
    }

    const originalWinApp = ScriptExecutor._winApp;
    const originalIsWindows = ScriptExecutor.isWindows;
    let passedToDoScript = null;
    ScriptExecutor.isWindows = () => true;
    ScriptExecutor._winApp = {
      DoScript(code, lang) {
        passedToDoScript = { code, lang };
        return 'win-ok';
      }
    };
    try {
      const res = await ScriptExecutor.executeInDesignScript('"hi";', {
        disableRedraw: true,
        fastUndo: true,
        undoName: 'Win Op'
      });
      assert.equal(res, 'win-ok');
      assert.equal(passedToDoScript.lang, 1246973031);
      assert.equal(passedToDoScript.code.includes('UndoModes.ENTIRE_SCRIPT'), true);
      assert.equal(passedToDoScript.code.includes('UndoModes.FAST_ENTIRE_SCRIPT'), false);
      assert.equal(passedToDoScript.code.includes('"Win Op"'), true);
      assert.equal(passedToDoScript.code.includes('enableRedraw = false'), true);
    } finally {
      ScriptExecutor._winApp = originalWinApp;
      ScriptExecutor.isWindows = originalIsWindows;
    }
  }
}

// 7) ES3 __mcpJsonEscapeString single-regex implementation matches legacy char-by-char escaping exactly.
{
  assert.equal(EXTENDSCRIPT_RUNTIME_SNIPPET.includes('.replace('), true);
  const sandbox = { JSON: undefined };
  vm.runInNewContext(EXTENDSCRIPT_RUNTIME_SNIPPET, sandbox);
  const escapeFn = sandbox.__mcpJsonEscapeString;
  assert.equal(typeof escapeFn, 'function');

  function legacyEscape(str) {
    if (str === null || str === undefined) return '';
    let result = '';
    const backslash = String.fromCharCode(92);
    for (let i = 0; i < str.length; i++) {
      const ch = str.charAt(i);
      const code = str.charCodeAt(i);
      if (code === 34) result += backslash + '"';
      else if (code === 92) result += backslash + backslash;
      else if (code === 8) result += backslash + 'b';
      else if (code === 9) result += backslash + 't';
      else if (code === 10) result += backslash + 'n';
      else if (code === 12) result += backslash + 'f';
      else if (code === 13) result += backslash + 'r';
      else if (code === 0x2028 || code === 0x2029) result += backslash + 'u' + code.toString(16);
      else if (code < 32) result += backslash + 'u' + ('0000' + code.toString(16)).slice(-4);
      else result += ch;
    }
    return result;
  }

  let allControls = '';
  for (let code = 0; code < 32; code++) {
    allControls += String.fromCharCode(code);
  }
  const samples = [
    null,
    undefined,
    '',
    'plain text 123',
    allControls,
    'quote: " backslash: \\ path: \\\\nas\\proj\\文档 "A"\r\n\t\b\f',
    'line-sep:\u2028para-sep:\u2029中文测试',
  ];
  for (const sample of samples) {
    assert.equal(escapeFn(sample), legacyEscape(sample));
  }
  const roundTripPayload = {
    text: 'quote " \\ \b\t\n\f\r\x00\x1f \u2028 \u2029 中文',
    nested: [1, true, null, 'ok']
  };
  const serializedInSandbox = vm.runInNewContext(
    `${EXTENDSCRIPT_RUNTIME_SNIPPET}\nJSON.stringify({ text: "quote \\" \\\\ \\b\\t\\n\\f\\r\\x00\\x1f \\u2028 \\u2029 中文", nested: [1, true, null, "ok"] });`,
    { JSON: undefined }
  );
  assert.deepEqual(JSON.parse(serializedInSandbox), roundTripPayload);
}

// 8) Windows COM ProgID candidate priority, local cache read/write, write error tolerance, and 14-item fallback.
{
  assert.equal(DEFAULT_COM_PROG_IDS.length, 14);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'indesign-com-progid-test-'));
  try {
    const cachePath = path.join(tmpDir, 'indesign-cli', 'state', 'com-progid.json');

    // 8a) Without env or cache: exact 14 default items
    assert.deepEqual(
      ScriptExecutor.getWindowsComProgIds({ env: {}, cachePath }),
      DEFAULT_COM_PROG_IDS
    );

    // 8b) First hit caches ProgID; subsequent resolution hits cached ProgID on attempt #1
    const firstAttempts = [];
    function FakeWinax2024(id) {
      firstAttempts.push(id);
      if (id !== 'InDesign.Application.2024') {
        throw new Error(`not registered: ${id}`);
      }
      this.progId = id;
    }
    const app1 = ScriptExecutor._resolveWindowsInDesignApp(FakeWinax2024, { env: {}, cachePath });
    assert.equal(app1.progId, 'InDesign.Application.2024');
    assert.equal(fs.existsSync(cachePath), true);
    assert.equal(JSON.parse(fs.readFileSync(cachePath, 'utf8')).progId, 'InDesign.Application.2024');
    assert.equal(firstAttempts.length > 1, true);

    const secondAttempts = [];
    function FakeWinax2024Cached(id) {
      secondAttempts.push(id);
      if (id !== 'InDesign.Application.2024') {
        throw new Error(`not registered: ${id}`);
      }
      this.progId = id;
    }
    const app2 = ScriptExecutor._resolveWindowsInDesignApp(FakeWinax2024Cached, { env: {}, cachePath });
    assert.equal(app2.progId, 'InDesign.Application.2024');
    assert.deepEqual(secondAttempts, ['InDesign.Application.2024']);

    // 8c) Env INDESIGN_CLI_COM_PROGID takes precedence over cached ProgID, deduplicated with full 14-item list
    const orderedWithEnv = ScriptExecutor.getWindowsComProgIds({
      env: { INDESIGN_CLI_COM_PROGID: 'InDesign.Application.Custom' },
      cachePath
    });
    assert.equal(orderedWithEnv[0], 'InDesign.Application.Custom');
    assert.equal(orderedWithEnv[1], 'InDesign.Application.2024');
    assert.equal(orderedWithEnv.length, 15);
    assert.equal(new Set(orderedWithEnv).size, 15);

    // 8d) Stale cached ProgID falls back to full 14-item list and updates cache
    const fallbackAttempts = [];
    function FakeWinaxUpgraded(id) {
      fallbackAttempts.push(id);
      if (id !== 'InDesign.Application.2025') {
        throw new Error(`stale: ${id}`);
      }
      this.progId = id;
    }
    const app3 = ScriptExecutor._resolveWindowsInDesignApp(FakeWinaxUpgraded, { env: {}, cachePath });
    assert.equal(app3.progId, 'InDesign.Application.2025');
    assert.equal(fallbackAttempts[0], 'InDesign.Application.2024');
    assert.equal(fallbackAttempts.includes('InDesign.Application.2025'), true);
    assert.equal(JSON.parse(fs.readFileSync(cachePath, 'utf8')).progId, 'InDesign.Application.2025');

    // 8e) Unwritable cache path does not break COM resolution
    const blockingFile = path.join(tmpDir, 'not-a-dir');
    fs.writeFileSync(blockingFile, 'x', 'utf8');
    const unwritableCachePath = path.join(blockingFile, 'com-progid.json');
    const app4 = ScriptExecutor._resolveWindowsInDesignApp(FakeWinaxUpgraded, {
      env: {},
      cachePath: unwritableCachePath
    });
    assert.equal(app4.progId, 'InDesign.Application.2025');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// 9) population.js, slides.js, tables.js enable disableRedraw: true, and populate_table prefers batch table.contents with safe fallback.
{
  // 9a) Verify disableRedraw: true is passed by population, slides, and tables tools
  {
    const originalExec = ScriptExecutor.executeInDesignScript;
    const seenOptions = [];
    ScriptExecutor.executeInDesignScript = async (_script, options) => {
      seenOptions.push(options);
      return JSON.stringify({
        success: true,
        data: { templatePath: '', templateFsPath: '', applied: [], warnings: [], missingSlots: [], savedPath: '' }
      });
    };
    try {
      await populateTemplateSlots({ values: { title: 'Hello' } });
      await addCoverPage({ title: 'Cover' });
      await addSectionPage({ title: 'Section' });
      await addFullBleedImage({ filePath: 'C:\\a.jpg' });
      await addImageGrid({ files: ['C:\\a.jpg'] });
      await createTable.handler({ rows: 2, columns: 2 });
      await populateTable.handler({ data: [['A', 'B'], ['C', 'D']] });
    } finally {
      ScriptExecutor.executeInDesignScript = originalExec;
    }
    assert.equal(seenOptions.length, 7);
    for (const opt of seenOptions) {
      assert.equal(opt?.disableRedraw, true);
    }
  }

  function createFakeTableApp({
    rows,
    cols,
    initialContents,
    mergedCellCount = null,
    throwOnBatchAssign = false
  }) {
    const state = {
      contents: initialContents ? [...initialContents] : new Array(rows * cols).fill(''),
      batchReads: 0,
      batchWrites: 0,
      cellItemCalls: 0,
    };
    const cellCount = mergedCellCount ?? (rows * cols);
    const table = {
      rows: { length: rows },
      columns: { length: cols },
      cells: {
        length: cellCount,
        item(r, c) {
          state.cellItemCalls += 1;
          const idx = r * cols + c;
          return {
            get contents() { return state.contents[idx]; },
            set contents(v) { state.contents[idx] = v; },
          };
        }
      },
      get contents() {
        state.batchReads += 1;
        return [...state.contents];
      },
      set contents(arr) {
        if (throwOnBatchAssign) {
          throw new Error('batch contents assignment unsupported');
        }
        state.batchWrites += 1;
        state.contents = [...arr];
      }
    };
    const page = { textFrames: [{ tables: [table] }] };
    const doc = { pages: [page] };
    const app = { documents: [doc], activeDocument: doc, activeWindow: { activePage: page } };
    return { app, state };
  }

  async function runPopulateTableWithFakeApp(fakeApp, args) {
    const originalExec = ScriptExecutor.executeInDesignScript;
    let receivedOptions = null;
    ScriptExecutor.executeInDesignScript = async (script, options) => {
      receivedOptions = options;
      const result = vm.runInNewContext(script, { app: fakeApp });
      return result === undefined || result === null ? '' : String(result);
    };
    try {
      const res = await populateTable.handler(args);
      return { res, receivedOptions };
    } finally {
      ScriptExecutor.executeInDesignScript = originalExec;
    }
  }

  // 9b) Full overwrite uses batch table.contents = flatArray with 0 reads and 0 cells.item calls
  {
    const { app, state } = createFakeTableApp({ rows: 2, cols: 2 });
    const { res, receivedOptions } = await runPopulateTableWithFakeApp(app, {
      data: [['H1', 'H2'], ['V1', 'V2']]
    });
    assert.equal(res.success, true);
    assert.equal(receivedOptions?.disableRedraw, true);
    assert.equal(state.batchReads, 0);
    assert.equal(state.batchWrites, 1);
    assert.equal(state.cellItemCalls, 0);
    assert.deepEqual(state.contents, ['H1', 'H2', 'V1', 'V2']);
  }

  // 9c) Partial overwrite with startRow/startColumn preserves untouched cells in 1 batch write
  {
    const { app, state } = createFakeTableApp({
      rows: 3,
      cols: 3,
      initialContents: ['0', '1', '2', '3', '4', '5', '6', '7', '8']
    });
    const { res } = await runPopulateTableWithFakeApp(app, {
      startRow: 1,
      startColumn: 1,
      data: [['X', 'Y'], ['Z', 'W']]
    });
    assert.equal(res.success, true);
    assert.equal(state.batchReads, 1);
    assert.equal(state.batchWrites, 1);
    assert.equal(state.cellItemCalls, 0);
    assert.deepEqual(state.contents, ['0', '1', '2', '3', 'X', 'Y', '6', 'Z', 'W']);
  }

  // 9d) Merged-cell table falls back cleanly to table.cells.item(r, c)
  {
    const { app, state } = createFakeTableApp({
      rows: 2,
      cols: 2,
      mergedCellCount: 3
    });
    const { res } = await runPopulateTableWithFakeApp(app, {
      data: [['A', 'B'], ['C', 'D']]
    });
    assert.equal(res.success, true);
    assert.equal(state.batchWrites, 0);
    assert.equal(state.cellItemCalls, 4);
    assert.deepEqual(state.contents, ['A', 'B', 'C', 'D']);
  }

  // 9e) Error during batch table.contents assignment falls back cleanly to cell-by-cell writes
  {
    const { app, state } = createFakeTableApp({
      rows: 2,
      cols: 2,
      throwOnBatchAssign: true
    });
    const { res } = await runPopulateTableWithFakeApp(app, {
      data: [['P', 'Q'], ['R', 'S']]
    });
    assert.equal(res.success, true);
    assert.equal(state.batchWrites, 0);
    assert.equal(state.cellItemCalls, 4);
    assert.deepEqual(state.contents, ['P', 'Q', 'R', 'S']);
  }
}

console.log('registry contract tests passed');
