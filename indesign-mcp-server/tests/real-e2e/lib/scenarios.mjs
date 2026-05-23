import fs from 'node:fs/promises';
import path from 'node:path';

import { runCli, toolCall } from './cli.mjs';
import { recordCallCoverage } from './coverage.mjs';
import { relativeToRun, writeCheckpoint, writeJson } from './run-dir.mjs';

const MAIN_DOCUMENT_NAME = 'architecture-presentation.indd';

function jsxString(value) {
  return JSON.stringify(String(value ?? ''))
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function coverageSource(toolId) {
  const domain = toolId.split('.')[0];
  if (['server', 'session', 'export'].includes(domain)) return 'cli';
  if (domain === 'script') return 'script';
  if (domain === 'template') return 'advanced';
  if (['book', 'presentation'].includes(domain)) return 'hidden_handler';
  return 'classic';
}

function semanticText(call) {
  const data = call.payload?.data;
  const parsed = data?.parsed;
  const candidates = [
    parsed?.result,
    parsed?.content?.[0]?.text,
    data?.result,
    data?.content?.[0]?.text,
  ];
  return String(candidates.find(value => value !== undefined && value !== null) || '');
}

function isSemanticallyOk(call) {
  if (!call.ok) return false;
  const text = semanticText(call);
  if (!text) return true;
  return ![
    /^Error\b/i,
    /No document open/i,
    /not found/i,
    /out of range/i,
    /activation failed/i,
    /failed/i,
  ].some(pattern => pattern.test(text));
}

async function callRequired(run, toolId, args = {}, options = {}) {
  const call = await toolCall(run, toolId, args, {
    source: options.source || coverageSource(toolId),
    backend: options.backend,
  });
  const ok = isSemanticallyOk(call);
  await recordCallCoverage(run, toolId, call, {
    status: ok ? (options.status || 'passed') : 'failed',
    artifact_paths: options.artifact_paths || [],
    audit_refs: options.audit_refs || [],
    note: options.note,
  });
  if (!ok) {
    throw new Error(`${toolId} failed: ${semanticText(call) || call.stderr || call.stdout}`);
  }
  return call;
}

async function scriptRunFile(run, scriptPath, options = {}) {
  const call = await runCli(run, ['script', 'run', scriptPath], {
    toolId: 'script.run',
    source: 'script',
    backend: 'script_bridge',
  });
  const ok = isSemanticallyOk(call);
  await recordCallCoverage(run, 'script.run', call, {
    status: ok ? (options.status || 'passed') : 'failed',
    artifact_paths: options.artifact_paths || [],
    audit_refs: options.audit_refs || [],
    note: options.note,
  });
  if (!ok) {
    throw new Error(`script.run failed: ${semanticText(call) || call.stderr || call.stdout}`);
  }
  return call;
}

async function loadDeckBrief(run) {
  const filePath = path.join(run.realE2eRoot, 'deck-brief.json');
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function writeDeckSkeletonScript(run, brief) {
  const scriptPath = path.join(run.dirs.scripts, 'create-deck-skeleton.jsx');
  const pageData = JSON.stringify(brief.pages);
  const projectName = jsxString(brief.project.name);
  const projectType = jsxString(brief.project.type);
  const site = jsxString(brief.project.site);

  const script = `
(function () {
  function color(doc, name, rgb) {
    var c = doc.colors.itemByName(name);
    if (!c.isValid) {
      c = doc.colors.add({ name: name, model: ColorModel.PROCESS, space: ColorSpace.RGB, colorValue: rgb });
    }
    return c;
  }
  function layer(doc, name) {
    var l = doc.layers.itemByName(name);
    if (!l.isValid) {
      l = doc.layers.add({ name: name });
    }
    l.visible = true;
    l.locked = false;
    return l;
  }
  function addText(page, itemLayer, bounds, text, size, colorRef, label) {
    var frame = page.textFrames.add({ geometricBounds: bounds, itemLayer: itemLayer });
    frame.contents = text;
    frame.label = label;
    try {
      frame.texts[0].pointSize = size;
      frame.texts[0].fillColor = colorRef;
    } catch (e) {}
    return frame;
  }
  if (app.documents.length === 0) {
    throw new Error("NO_DOCUMENT");
  }
  var doc = app.activeDocument;
  doc.viewPreferences.horizontalMeasurementUnits = MeasurementUnits.POINTS;
  doc.viewPreferences.verticalMeasurementUnits = MeasurementUnits.POINTS;
  doc.documentPreferences.facingPages = false;
  doc.documentPreferences.pageWidth = 914.4;
  doc.documentPreferences.pageHeight = 514.8;
  while (doc.pages.length < 28) {
    doc.pages.add();
  }
  while (doc.pages.length > 28) {
    doc.pages[doc.pages.length - 1].remove();
  }

  var pages = ${pageData};
  var paper = doc.swatches.itemByName("Paper");
  var black = doc.swatches.itemByName("Black");
  var blue = color(doc, "E2E 深蓝", [24, 49, 83]);
  var teal = color(doc, "E2E 滨水青", [37, 138, 130]);
  var warm = color(doc, "E2E 砖红", [169, 82, 55]);
  var green = color(doc, "E2E 低碳绿", [81, 139, 83]);
  var gray = color(doc, "E2E 冷灰", [229, 232, 234]);
  var layers = {
    background: layer(doc, "background"),
    photos: layer(doc, "photos"),
    diagrams: layer(doc, "diagrams"),
    text: layer(doc, "text"),
    annotations: layer(doc, "annotations")
  };
  var sectionColors = {
    "封面": blue,
    "目录": teal,
    "背景": warm,
    "策略": teal,
    "形体": blue,
    "方案": green,
    "分析": teal,
    "技术": warm,
    "实施": green,
    "模板": blue,
    "审计": warm,
    "结论": blue
  };

  for (var i = 0; i < pages.length; i++) {
    var meta = pages[i];
    var page = doc.pages[i];
    var number = ("0" + meta.page).slice(-2);
    var label = "e2e.deck.page." + number + "." + meta.slug;
    page.label = label;
    var sectionColor = sectionColors[meta.section] || teal;
    var bg = page.rectangles.add({ geometricBounds: [0, 0, 514.8, 914.4], itemLayer: layers.background });
    bg.fillColor = (i % 2 === 0) ? gray : paper;
    bg.strokeWeight = 0;
    bg.label = label + ".background";
    try { bg.sendToBack(); } catch (e) {}

    var band = page.rectangles.add({ geometricBounds: [0, 0, 514.8, 18], itemLayer: layers.background });
    band.fillColor = sectionColor;
    band.strokeWeight = 0;
    band.label = label + ".section-band";

    addText(page, layers.text, [28, 42, 76, 862], number + "  " + meta.title, i === 0 ? 30 : 24, blue, label + ".title");
    addText(page, layers.text, [84, 44, 130, 845], meta.section + " / " + ${projectName}, 11, teal, label + ".section");
    addText(page, layers.text, [420, 42, 454, 860], ${projectType} + "  |  " + ${site}, 9, black, label + ".footer");

    var cardTop = 156;
    for (var c = 0; c < 3; c++) {
      var left = 58 + c * 275;
      var card = page.rectangles.add({ geometricBounds: [cardTop, left, cardTop + 170, left + 220], itemLayer: layers.diagrams });
      card.fillColor = c === 0 ? sectionColor : (c === 1 ? paper : gray);
      card.strokeColor = sectionColor;
      card.strokeWeight = 1;
      card.label = label + ".diagram-card-" + (c + 1);
      addText(page, layers.annotations, [cardTop + 18, left + 18, cardTop + 58, left + 198], meta.audit_expectations[c % meta.audit_expectations.length], 12, c === 0 ? paper : black, label + ".annotation-" + (c + 1));
    }

    if (i === 0) {
      addText(page, layers.text, [156, 58, 240, 820], ${projectName}, 36, paper, label + ".cover-project-title");
      addText(page, layers.text, [250, 60, 292, 760], "方案评审会 / 真实 E2E 自动生成文稿", 15, paper, label + ".cover-subtitle");
    }
  }
  doc.activeLayer = layers.text;
  return "deck skeleton created pages=" + doc.pages.length + " labels=" + pages.length;
})();
`.trim();

  await fs.writeFile(scriptPath, script, 'utf8');
  return scriptPath;
}

async function runAudit(run, name = 'main-deck-structure') {
  const auditScript = path.join(run.realE2eRoot, 'validators', 'audit-document.jsx');
  const call = await scriptRunFile(run, auditScript, {
    note: `audit:${name}`,
  });
  const text = semanticText(call);
  const auditPath = path.join(run.dirs.reports, `${name}-audit.json`);
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { ok: false, error: 'AUDIT_JSON_PARSE_FAILED', raw: text };
  }
  await writeJson(auditPath, parsed);
  if (!parsed.ok || parsed.document?.pages !== 28) {
    throw new Error(`Audit failed for ${name}: ${JSON.stringify(parsed)}`);
  }
  return { audit: parsed, auditPath };
}

export function mainDocumentPath(run) {
  return path.join(run.dirs.outputs, MAIN_DOCUMENT_NAME);
}

export async function runBootstrapContract(run) {
  await callRequired(run, 'session.clear', {});
  await callRequired(run, 'server.health', { deep: true });
  await callRequired(run, 'session.show', {});
  await callRequired(run, 'utility.help', {});
  await writeCheckpoint(run, {
    phase: 'bootstrap_contract',
    status: 'passed',
    open_documents_expected: [],
    main_document_path: null,
    scratch_paths: [],
    next_phase: 'main_deck_setup',
  });
  return { status: 'passed' };
}

export async function runMainDeckSetup(run) {
  const brief = await loadDeckBrief(run);
  const documentPath = mainDocumentPath(run);

  await callRequired(run, 'document.create_document', {
    width: 914.4,
    height: 514.8,
    pages: 1,
    facingPages: false,
    pageOrientation: 'LANDSCAPE',
    bleedTop: 9,
    bleedBottom: 9,
    bleedInside: 9,
    bleedOutside: 9,
    marginTop: 36,
    marginBottom: 36,
    marginLeft: 42,
    marginRight: 42,
  });
  await callRequired(run, 'document.set_document_preferences', {
    preferenceType: 'GENERAL',
    preferences: {
      pageWidth: 320,
      pageHeight: 180,
      facingPages: false,
      documentBleedTopOffset: 3,
      documentBleedBottomOffset: 3,
      documentBleedInsideOrLeftOffset: 3,
      documentBleedOutsideOrRightOffset: 3,
    },
  });
  await callRequired(run, 'document.get_document_preferences', { preferenceType: 'GENERAL' });
  await callRequired(run, 'document.set_document_layout_preferences', {
    adjustLayout: false,
    adjustLayoutMargins: true,
    adjustLayoutPageBreaks: true,
  });
  await callRequired(run, 'document.get_document_layout_preferences', {});

  for (const layerName of ['background', 'photos', 'diagrams', 'text', 'annotations']) {
    await callRequired(run, 'layer.create_layer', { name: layerName, visible: true, locked: false, color: 'BLUE' });
  }
  await callRequired(run, 'layer.set_active_layer', { layerName: 'text' });
  await callRequired(run, 'layer.list_layers', {});

  for (const master of ['A-Cover', 'B-Content', 'C-Analysis']) {
    await callRequired(run, 'master.create_master_spread', { name: master });
  }
  await callRequired(run, 'master.duplicate_master_spread', {
    name: 'A-Cover',
    newName: 'D-Cover-Copy',
    masterIndex: 0,
    position: 'AT_END',
  });
  await callRequired(run, 'master.create_master_text_frame', {
    masterName: 'A-Cover',
    content: '东岸文化中心 / E2E',
    x: 42,
    y: 462,
    width: 420,
    height: 30,
    fontSize: 10,
  });
  await callRequired(run, 'master.create_master_rectangle', {
    masterName: 'A-Cover',
    x: 0,
    y: 0,
    width: 18,
    height: 514,
    fillColor: 'Black',
    strokeColor: 'Black',
    strokeWidth: 0,
  });
  await callRequired(run, 'master.create_master_guides', {
    masterName: 'A-Cover',
    numberOfRows: 2,
    numberOfColumns: 3,
    rowGutter: '6pt',
    columnGutter: '8pt',
    guideColor: '[0, 0, 255]',
    fitMargins: true,
  });
  await callRequired(run, 'master.get_master_spread_info', { name: 'A-Cover', masterIndex: 0 });
  await callRequired(run, 'document.list_master_spreads', {});

  await callRequired(run, 'page.add_page', { position: 'AT_END' });
  await callRequired(run, 'master.apply_master_spread', { masterName: 'A-Cover', pageRange: '1' });
  await callRequired(run, 'master.apply_master_spread', { masterName: 'B-Content', pageRange: '2-28' });

  const skeletonScript = await writeDeckSkeletonScript(run, brief);
  await scriptRunFile(run, skeletonScript, {
    artifact_paths: [relativeToRun(run, skeletonScript)],
    note: 'create 28-page architecture deck skeleton',
  });

  await callRequired(run, 'spread.list_spreads', {});
  await callRequired(run, 'spread.get_spread_info', { spreadIndex: 0 });
  await callRequired(run, 'spread.set_spread_properties', {
    spreadIndex: 0,
    name: 'e2e.spread.cover',
    allowPageShuffle: false,
    showMasterItems: true,
    spreadHidden: false,
  });
  await callRequired(run, 'spread.create_spread_guides', {
    spreadIndex: 0,
    numberOfRows: 2,
    numberOfColumns: 4,
    rowGutter: '6pt',
    columnGutter: '8pt',
    guideColor: 'BLUE',
    fitMargins: true,
  });
  await callRequired(run, 'spread.select_spread', { spreadIndex: 0 });

  await callRequired(run, 'page.navigate_to_page', { pageIndex: 0 });
  await callRequired(run, 'page.get_page_info', { pageIndex: 0 });
  await callRequired(run, 'page.set_page_properties', {
    pageIndex: 0,
    label: 'e2e.deck.page.01.cover',
    pageColor: 'BLUE',
    optionalPage: false,
  });
  await callRequired(run, 'page.adjust_page_layout', {
    pageIndex: 0,
    leftMargin: '14mm',
    topMargin: '12mm',
    rightMargin: '14mm',
    bottomMargin: '12mm',
  });
  await callRequired(run, 'page.create_page_guides', {
    pageIndex: 0,
    numberOfRows: 3,
    numberOfColumns: 4,
    rowGutter: '6pt',
    columnGutter: '8pt',
    guideColor: 'BLUE',
    fitMargins: true,
  });
  await callRequired(run, 'page.select_page', { pageIndex: 0 });
  await callRequired(run, 'page.zoom_to_page', { pageIndex: 0, zoomLevel: 100 });

  await callRequired(run, 'document.save_document', { filePath: documentPath }, {
    artifact_paths: [relativeToRun(run, documentPath)],
  });
  await callRequired(run, 'document.get_document_info', {});

  const { auditPath } = await runAudit(run);
  await writeCheckpoint(run, {
    phase: 'main_deck_setup',
    status: 'passed',
    open_documents_expected: [documentPath],
    main_document_path: documentPath,
    scratch_paths: [],
    next_phase: 'content_text_table',
  });

  return {
    status: 'passed',
    mainDocumentPath: documentPath,
    auditPath: relativeToRun(run, auditPath),
  };
}
