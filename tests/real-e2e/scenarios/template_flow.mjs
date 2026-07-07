import fs from 'node:fs/promises';
import path from 'node:path';

import {
  callExpectedFailure,
  callRequired,
  dataPath,
  isSemanticallyOk,
  jsxPath,
  loadDeckBrief,
  mainDocumentPath,
  photoPath,
  recordCallCoverage,
  relativeToRun,
  runAudit,
  runCli,
  scriptRunFile,
  semanticText,
  svgPath,
  toolCall,
  writeBookFixtureScript,
  writeCheckpoint,
  writeCloseBooksScript,
  writeDeckSkeletonScript,
  writeDestructiveScratchSetupScript,
  writeJson,
  writeMainDeckFinalCleanupScript,
  writePopulateContentScript,
  writePresentationNavigationScript,
  writeScratchIndexScript,
  writeTemplateSetupScript,
} from './shared.mjs';

export async function runTemplateAndScriptTransport(run) {
  const documentPath = mainDocumentPath(run);
  const setupScript = await writeTemplateSetupScript(run);
  const setupCall = await toolCall(run, 'template.run_jsx_file', { filePath: setupScript }, {
    source: 'advanced',
    backend: 'mcp_advanced',
  });
  const setupOk = isSemanticallyOk(setupCall);
  await recordCallCoverage(run, 'template.run_jsx_file', setupCall, {
    status: setupOk ? 'passed' : 'failed',
    artifact_paths: [relativeToRun(run, setupScript)],
  });
  if (!setupOk) {
    throw new Error(`template.run_jsx_file failed: ${semanticText(setupCall) || setupCall.stdout}`);
  }

  await callRequired(run, 'template.list_template_blueprints', {});
  await callRequired(run, 'template.inspect_template_blueprint', {});
  await callRequired(run, 'template.create_page_with_template', {
    templateName: 'B-Content',
    position: 'AT_END',
    label: 'e2e.deck.page.29.template-generated',
  });
  await callRequired(run, 'page.get_page_information', { pageIndex: 28 });
  await callRequired(run, 'template.populate_template_slots', {
    pageIndex: 28,
    values: {
      title: { text: '模板槽位页 / CLI 生成' },
      metric: { text: '槽位填充：标题、指标、图片均由高级模板工具完成' },
      image: {
        imagePath: photoPath(run, 'architecture-facade'),
        fit: 'FILL_FRAME',
        clearExisting: true,
      },
    },
  });

  const fileScript = path.join(run.dirs.scripts, 'script-transport-file.jsx');
  await fs.writeFile(fileScript, `
(function () {
  if (app.documents.length === 0) throw new Error("NO_DOCUMENT");
  var doc = app.activeDocument;
  doc.insertLabel("e2e.script.file", "中文 路径 空格 \\\\ 引号");
  return "script file ok:" + doc.extractLabel("e2e.script.file");
})();
`.trim(), 'utf8');
  await scriptRunFile(run, fileScript, {
    artifact_paths: [relativeToRun(run, fileScript)],
    note: 'script.run file transport',
  });

  const stdinCall = await runCli(run, ['script', 'run', '--stdin'], {
    toolId: 'script.run',
    source: 'script',
    backend: 'script_bridge',
    stdin: `
(function () {
  if (app.documents.length === 0) throw new Error("NO_DOCUMENT");
  var doc = app.activeDocument;
  var value = doc.extractLabel("e2e.script.file");
  doc.insertLabel("e2e.script.stdin", "stdin读取:" + value);
  return "script stdin ok:" + doc.extractLabel("e2e.script.stdin");
})();
`.trim(),
  });
  const stdinOk = isSemanticallyOk(stdinCall);
  await recordCallCoverage(run, 'script.run', stdinCall, {
    status: stdinOk ? 'passed' : 'failed',
    note: 'script.run stdin transport',
  });
  if (!stdinOk) {
    throw new Error(`script.run --stdin failed: ${semanticText(stdinCall) || stdinCall.stdout}`);
  }

  await callRequired(run, 'script.execute_indesign_code', {
    code: [
      'var doc = app.activeDocument;',
      'doc.insertLabel("e2e.script.code", "execute_indesign_code 中文/空格/\\\\\\\\/\\\"");',
      '"script code ok:" + doc.extractLabel("e2e.script.code");',
    ].join('\n'),
  });

  await callRequired(run, 'document.save_document', { filePath: documentPath }, {
    artifact_paths: [relativeToRun(run, documentPath)],
  });
  await writeCheckpoint(run, {
    phase: 'template_flow',
    status: 'passed',
    open_documents_expected: [documentPath],
    main_document_path: documentPath,
    scratch_paths: [],
    next_phase: 'destructive_scratch',
  });
  return { status: 'passed' };
}
