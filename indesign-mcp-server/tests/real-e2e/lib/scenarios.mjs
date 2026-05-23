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

function jsxPath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/"/g, '\\"');
}

function coverageSource(toolId) {
  const domain = toolId.split('.')[0];
  if (['server', 'session'].includes(domain) || toolId === 'export.verify') return 'cli';
  if (domain === 'script') return 'script';
  if (domain === 'template') return 'advanced';
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

async function callExpectedFailure(run, toolId, args = {}, expectedPattern = /not found|Error|failed/i, options = {}) {
  const call = await toolCall(run, toolId, args, {
    source: options.source || coverageSource(toolId),
    backend: options.backend,
  });
  const text = semanticText(call);
  const expected = !isSemanticallyOk(call) || expectedPattern.test(text) || call.payload?.ok === false;
  await recordCallCoverage(run, toolId, call, {
    status: expected ? 'expected_failure_passed' : 'failed',
    artifact_paths: options.artifact_paths || [],
    audit_refs: options.audit_refs || [],
    note: options.note,
  });
  if (!expected) {
    throw new Error(`${toolId} expected failure did not happen: ${text || call.stdout}`);
  }
  return call;
}

async function scriptRunFile(run, scriptPath, options = {}) {
  const call = await runCli(run, ['script', 'run', scriptPath], {
    toolId: 'script.run',
    source: 'script',
    backend: 'script_bridge',
  });
  const ok = options.allowAnyText ? call.ok : isSemanticallyOk(call);
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

function photoPath(run, name) {
  return path.join(run.dirs.assets, 'photos', `${name}.jpg`);
}

function svgPath(run, name) {
  return path.join(run.dirs.assets, 'svg', `${name}.svg`);
}

function dataPath(run, name) {
  return path.join(run.dirs.assets, 'data', name);
}

async function writePopulateContentScript(run, brief) {
  const scriptPath = path.join(run.dirs.scripts, 'populate-architecture-content.jsx');
  const assets = {
    hero: jsxPath(photoPath(run, 'hero-waterfront')),
    industrial: jsxPath(photoPath(run, 'industrial-site')),
    urban: jsxPath(photoPath(run, 'urban-site')),
    facade: jsxPath(photoPath(run, 'architecture-facade')),
    brick: jsxPath(photoPath(run, 'brick-material')),
    greenRoof: jsxPath(photoPath(run, 'green-roof')),
    location: jsxPath(svgPath(run, 'location-map')),
    masterplan: jsxPath(svgPath(run, 'masterplan')),
    floor01: jsxPath(svgPath(run, 'floor-01')),
    floor02: jsxPath(svgPath(run, 'floor-02')),
    section: jsxPath(svgPath(run, 'section')),
    sun: jsxPath(svgPath(run, 'sun-path')),
    circulation: jsxPath(svgPath(run, 'circulation')),
    icons: jsxPath(svgPath(run, 'material-icons')),
    xml: jsxPath(dataPath(run, 'site-data.xml')),
  };
  const pageData = JSON.stringify(brief.pages);
  const script = `
(function () {
  function layer(doc, name) {
    var l = doc.layers.itemByName(name);
    if (!l.isValid) l = doc.layers.add({ name: name });
    return l;
  }
  function color(doc, name, rgb) {
    var c = doc.colors.itemByName(name);
    if (!c.isValid) c = doc.colors.add({ name: name, model: ColorModel.PROCESS, space: ColorSpace.RGB, colorValue: rgb });
    return c;
  }
  function addText(page, itemLayer, bounds, content, size, fill, label) {
    var frame = page.textFrames.add({ geometricBounds: bounds, itemLayer: itemLayer });
    frame.contents = content;
    frame.label = label;
    try { frame.texts[0].pointSize = size; } catch (e) {}
    try { frame.texts[0].fillColor = fill; } catch (e) {}
    return frame;
  }
function place(page, itemLayer, filePath, bounds, label, fitFill) {
    var file = File(filePath);
    var frame = page.rectangles.add({ geometricBounds: bounds, itemLayer: itemLayer });
    frame.label = label;
    frame.strokeWeight = 0;
    if (file.exists) {
      try {
        frame.place(file);
        frame.fit(fitFill ? FitOptions.FILL_PROPORTIONALLY : FitOptions.PROPORTIONALLY);
        frame.fit(FitOptions.CENTER_CONTENT);
      } catch (e) {
        frame.label = label + ".place-failed." + e.message;
      }
    } else {
      frame.label = label + ".missing-file";
    }
    return frame;
  }
  function labelPageObject(page, label) {
    var marker = page.rectangles.add({ geometricBounds: [470, 860, 490, 890] });
    marker.label = label + ".marker";
    marker.strokeWeight = 0;
    return marker;
  }
  if (app.documents.length === 0) throw new Error("NO_DOCUMENT");
  var doc = app.activeDocument;
  var pages = ${pageData};
  var photos = layer(doc, "photos");
  var diagrams = layer(doc, "diagrams");
  var textLayer = layer(doc, "text");
  var annotations = layer(doc, "annotations");
  var blue = color(doc, "E2E 工具青", [37, 138, 130]);
  var brick = color(doc, "E2E 砖红", [169, 82, 55]);
  var green = color(doc, "E2E 低碳绿", [81, 139, 83]);
  var black = doc.swatches.itemByName("Black");
  var assetMap = {
    "cover": "${assets.hero}",
    "toc": "${assets.hero}",
    "location": "${assets.location}",
    "site-photos": "${assets.industrial}",
    "goals": "${assets.icons}",
    "strategy": "${assets.icons}",
    "masterplan": "${assets.masterplan}",
    "floor-01": "${assets.floor01}",
    "floor-02": "${assets.floor02}",
    "section": "${assets.section}",
    "facade": "${assets.facade}",
    "circulation": "${assets.circulation}",
    "landscape": "${assets.greenRoof}",
    "sun": "${assets.sun}",
    "views": "${assets.circulation}",
    "materials": "${assets.brick}",
    "structure": "${assets.section}",
    "sustainability": "${assets.greenRoof}",
    "template": "${assets.facade}",
    "closing": "${assets.hero}"
  };
  for (var i = 0; i < pages.length; i++) {
    var meta = pages[i];
    var page = doc.pages[i];
    var number = ("0" + meta.page).slice(-2);
    var base = "e2e.deck.page." + number + "." + meta.slug;
    labelPageObject(page, base);
    var assetPath = assetMap[meta.slug];
    if (assetPath) {
      place(page, (assetPath.indexOf(".jpg") !== -1 ? photos : diagrams), assetPath, [140, 470, 390, 850], base + ".asset." + meta.slug, true);
    }
    addText(page, textLayer, [132, 58, 148, 430], "本页覆盖: " + meta.audit_expectations.join(" / "), 9, black, base + ".coverage-note");
    if (meta.slug === "site-photos") {
      place(page, photos, "${assets.urban}", [160, 70, 280, 250], base + ".asset.urban-site", true);
      place(page, photos, "${assets.facade}", [160, 270, 280, 450], base + ".asset.facade", true);
      place(page, photos, "${assets.greenRoof}", [300, 70, 420, 250], base + ".asset.green-roof", true);
      place(page, photos, "${assets.hero}", [300, 270, 420, 450], base + ".asset.waterfront", true);
    }
    if (meta.slug === "materials") {
      place(page, photos, "${assets.brick}", [160, 70, 285, 230], base + ".asset.brick", true);
      place(page, photos, "${assets.greenRoof}", [160, 250, 285, 410], base + ".asset.green-roof", true);
      place(page, photos, "${assets.industrial}", [305, 70, 430, 230], base + ".asset.industrial", true);
      place(page, diagrams, "${assets.icons}", [305, 250, 430, 410], base + ".asset.icons", false);
    }
    if (meta.slug === "metrics" || meta.slug === "program") {
      var tf = page.textFrames.add({ geometricBounds: [165, 70, 385, 440], itemLayer: textLayer });
      tf.label = base + ".metrics-table";
      var table = tf.insertionPoints[0].tables.add({ bodyRowCount: 5, bodyColumnCount: 3 });
      var values = [["指标","数值","说明"],["用地面积","9,400 sqm","测试数据"],["建筑面积","18,600 sqm","测试数据"],["容积率","1.98","测试数据"],["绿地率","32%","测试数据"]];
      for (var r = 0; r < values.length; r++) for (var c = 0; c < values[r].length; c++) table.cells.item(r, c).contents = values[r][c];
    }
  }
  try {
    var xmlFile = File("${assets.xml}");
    if (xmlFile.exists) doc.importXML(xmlFile);
  } catch (xmlError) {}
  doc.activeLayer = textLayer;
  return "architecture content populated pages=" + doc.pages.length + " links=" + doc.links.length;
})();
`.trim();
  await fs.writeFile(scriptPath, script, 'utf8');
  return scriptPath;
}

async function writeTemplateSetupScript(run) {
  const scriptPath = path.join(run.dirs.scripts, 'setup-template-slots.jsx');
  const script = `
(function () {
  if (app.documents.length === 0) throw new Error("NO_DOCUMENT");
  var doc = app.activeDocument;
  var master = doc.masterSpreads.itemByName("B-Content");
  if (!master || !master.isValid) throw new Error("B-Content master missing");
  var page = master.pages[0];
  function addText(bounds, label, contents) {
    var frame = page.textFrames.add({ geometricBounds: bounds });
    frame.contents = contents;
    frame.label = label;
    return frame;
  }
  function addRect(bounds, label) {
    var frame = page.rectangles.add({ geometricBounds: bounds });
    frame.label = label;
    frame.strokeWeight = 1;
    return frame;
  }
  addText([120, 70, 155, 520], "slot:title;type:text;desc:模板页标题", "模板标题槽位");
  addText([170, 70, 235, 360], "slot:metric;type:text;desc:模板指标", "模板指标槽位");
  addRect([150, 430, 360, 780], "slot:image;type:image;fit:FILL_FRAME;desc:模板图片");
  return "template slots ready";
})();
`.trim();
  await fs.writeFile(scriptPath, script, 'utf8');
  return scriptPath;
}

async function writeDestructiveScratchSetupScript(run) {
  const scriptPath = path.join(run.dirs.scripts, 'setup-destructive-scratch.jsx');
  const scratchPath = jsxPath(path.join(run.dirs.outputs, 'destructive-scratch.indd'));
  const script = `
(function () {
  var doc = app.documents.add();
  doc.documentPreferences.facingPages = false;
  doc.documentPreferences.pageWidth = 420;
  doc.documentPreferences.pageHeight = 297;
  while (doc.pages.length < 4) doc.pages.add();
  var page = doc.pages[0];
  var a = page.rectangles.add({ geometricBounds: [40, 40, 110, 130] });
  a.label = "e2e.scratch.rect.a";
  var b = page.rectangles.add({ geometricBounds: [40, 150, 110, 240] });
  b.label = "e2e.scratch.rect.b";
  var c = page.ovals.add({ geometricBounds: [130, 40, 210, 120] });
  c.label = "e2e.scratch.oval.c";
  var group = page.groups.add([a, b]);
  group.label = "e2e.scratch.group";
  var master = doc.masterSpreads.add();
  try { master.namePrefix = "Z"; } catch (e) {}
  try { master.baseName = "Scratch"; } catch (e) {}
  var mp = master.pages[0];
  var mr = mp.rectangles.add({ geometricBounds: [20, 20, 80, 100] });
  mr.label = "e2e.scratch.master.item";
  doc.pages[1].appliedMaster = master;
  var page2 = doc.pages[1];
  var p2a = page2.rectangles.add({ geometricBounds: [40, 40, 110, 130] });
  p2a.label = "e2e.scratch.page2.rect.a";
  var p2b = page2.rectangles.add({ geometricBounds: [40, 150, 110, 240] });
  p2b.label = "e2e.scratch.page2.rect.b";
  doc.save(File("${scratchPath}"));
  return "scratch ready:" + doc.fullName.fsName;
})();
`.trim();
  await fs.writeFile(scriptPath, script, 'utf8');
  return scriptPath;
}

async function writeScratchIndexScript(run) {
  const scriptPath = path.join(run.dirs.scripts, 'inspect-destructive-indexes.jsx');
  const script = `
(function () {
  var doc = app.activeDocument;
  var page = doc.pages[0];
  var groupIndex = 0;
  var firstNonGroupIndex = 0;
  for (var i = 0; i < page.allPageItems.length; i++) {
    var item = page.allPageItems[i];
    if (item.constructor && item.constructor.name === "Group") groupIndex = i;
    if (item.constructor && item.constructor.name !== "Group") firstNonGroupIndex = i;
  }
  return '{"groupIndex":' + groupIndex + ',"itemIndex":' + firstNonGroupIndex + '}';
})();
`.trim();
  await fs.writeFile(scriptPath, script, 'utf8');
  return scriptPath;
}

async function writeBookFixtureScript(run) {
  const scriptPath = path.join(run.dirs.scripts, 'create-book-fixture-docs.jsx');
  const docAPath = jsxPath(path.join(run.dirs.pathBook, 'chapter-01-site.indd'));
  const docBPath = jsxPath(path.join(run.dirs.pathBook, 'chapter-02-design.indd'));
  const script = `
(function () {
  function makeDoc(filePath, title, colorValue) {
    var doc = app.documents.add();
    doc.documentPreferences.facingPages = false;
    doc.documentPreferences.pageWidth = 210;
    doc.documentPreferences.pageHeight = 148;
    while (doc.pages.length < 2) doc.pages.add();
    var color = doc.colors.itemByName("E2E Book Accent");
    if (!color.isValid) {
      color = doc.colors.add({ name: "E2E Book Accent", model: ColorModel.PROCESS, space: ColorSpace.RGB, colorValue: colorValue });
    }
    for (var i = 0; i < doc.pages.length; i++) {
      var page = doc.pages[i];
      var band = page.rectangles.add({ geometricBounds: [0, 0, 148, 12] });
      band.fillColor = color;
      band.strokeWeight = 0;
      var tf = page.textFrames.add({ geometricBounds: [30, 24, 92, 186] });
      tf.contents = title + " / page " + (i + 1) + "\\n用于 Book handler 真实 E2E 覆盖。";
      try { tf.texts[0].pointSize = 14; } catch (e) {}
      tf.label = "e2e.book." + title + "." + (i + 1);
    }
    var file = File(filePath);
    var folder = file.parent;
    if (folder && !folder.exists) folder.create();
    doc.save(file);
    doc.close(SaveOptions.YES);
    return file.fsName;
  }
  var a = makeDoc("${docAPath}", "场地与背景", [37, 138, 130]);
  var b = makeDoc("${docBPath}", "方案与实施", [169, 82, 55]);
  return "book fixtures created:" + a + "|" + b;
})();
`.trim();
  await fs.writeFile(scriptPath, script, 'utf8');
  return scriptPath;
}

async function writeCloseBooksScript(run) {
  const scriptPath = path.join(run.dirs.scripts, 'close-open-books.jsx');
  const script = `
(function () {
  var closed = 0;
  for (var i = app.books.length - 1; i >= 0; i--) {
    try {
      app.books[i].close();
      closed++;
    } catch (e) {}
  }
  return "books closed=" + closed;
})();
`.trim();
  await fs.writeFile(scriptPath, script, 'utf8');
  return scriptPath;
}

async function writePresentationNavigationScript(run, pageIndex, scriptName) {
  const scriptPath = path.join(run.dirs.scripts, scriptName);
  const script = `
(function () {
  if (app.documents.length === 0) throw new Error("NO_DOCUMENT");
  var doc = app.activeDocument;
  while (doc.pages.length <= ${pageIndex}) doc.pages.add();
  try {
    if (app.layoutWindows.length > 0) {
      app.layoutWindows[0].activePage = doc.pages[${pageIndex}];
    }
  } catch (e) {}
  return "presentation active page=" + (${pageIndex} + 1);
})();
`.trim();
  await fs.writeFile(scriptPath, script, 'utf8');
  return scriptPath;
}

async function writeMainDeckFinalCleanupScript(run) {
  const scriptPath = path.join(run.dirs.scripts, 'final-clean-main-deck.jsx');
  const script = `
(function () {
  if (app.documents.length === 0) throw new Error("NO_DOCUMENT");
  var doc = app.activeDocument;
  var removed = 0;
  for (var i = doc.pages.length - 1; i >= 0; i--) {
    if (doc.pages[i].label === "e2e.deck.page.29.template-generated") {
      doc.pages[i].remove();
      removed++;
    }
  }
  while (doc.pages.length > 28) {
    doc.pages[doc.pages.length - 1].remove();
    removed++;
  }
  doc.save();
  return "main deck final cleanup removed=" + removed + " pages=" + doc.pages.length;
})();
`.trim();
  await fs.writeFile(scriptPath, script, 'utf8');
  return scriptPath;
}

async function runAudit(run, name = 'main-deck-structure') {
  const auditScript = path.join(run.realE2eRoot, 'validators', 'audit-document.jsx');
  const call = await scriptRunFile(run, auditScript, {
    note: `audit:${name}`,
    allowAnyText: true,
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

export async function runContentTextAndAssets(run) {
  const brief = await loadDeckBrief(run);
  const documentPath = mainDocumentPath(run);
  const contentScript = await writePopulateContentScript(run, brief);
  await scriptRunFile(run, contentScript, {
    artifact_paths: [relativeToRun(run, contentScript)],
    note: 'populate architecture presentation with placed assets and readable content',
  });

  await callRequired(run, 'style.create_color_swatch', {
    name: 'E2E 工具青',
    red: 37,
    green: 138,
    blue: 130,
  });
  await callRequired(run, 'style.create_color_swatch', {
    name: 'E2E 警示红',
    red: 180,
    green: 66,
    blue: 44,
  });
  await callRequired(run, 'style.create_paragraph_style', {
    name: 'E2E 标题',
    fontSize: 18,
    textColor: 'E2E 工具青',
    alignment: 'LEFT_ALIGN',
  });
  await callRequired(run, 'style.create_character_style', {
    name: 'E2E 强调',
    fontSize: 11,
    textColor: 'E2E 警示红',
    underline: true,
  });
  await callRequired(run, 'style.create_object_style', {
    name: 'E2E 图片框',
    fillColor: 'None',
    strokeColor: 'E2E 工具青',
    strokeWeight: 1,
    cornerRadius: 4,
    transparency: 92,
  });
  await callRequired(run, 'style.list_styles', { styleType: 'ALL' });
  await callRequired(run, 'style.list_color_swatches', {});
  await callRequired(run, 'style.list_object_styles', {});
  await callRequired(run, 'style.apply_paragraph_style', { styleName: 'E2E 标题', frameIndex: 0 });
  await callRequired(run, 'style.apply_character_style', { styleName: 'E2E 强调', frameIndex: 0, endIndex: -1 });
  await callRequired(run, 'style.apply_object_style', { styleName: 'E2E 图片框', itemType: 'rectangle', itemIndex: 0 });
  await callRequired(run, 'style.apply_color', {
    colorName: 'E2E 工具青',
    targetType: 'rectangle',
    frameIndex: 0,
    objectIndex: 0,
    colorType: 'fill',
  });

  await callRequired(run, 'page.navigate_to_page', { pageIndex: 23 });
  await callRequired(run, 'text.create_text_frame', {
    content: 'E2E 指标说明：用地、建筑面积、容积率、绿地率均来自测试 CSV 语义。',
    x: 75,
    y: 390,
    width: 420,
    height: 42,
    fontSize: 10,
    paragraphStyle: 'E2E 标题',
  });
  await callRequired(run, 'text.edit_text_frame', {
    frameIndex: 0,
    content: '技术指标 / CLI 覆盖页',
    fontSize: 20,
    alignment: 'LEFT',
  });
  await callRequired(run, 'text.create_table', {
    rows: 4,
    columns: 3,
    x: 520,
    y: 170,
    width: 300,
    height: 160,
    headerRows: 1,
  });
  await callRequired(run, 'text.populate_table', {
    tableIndex: 0,
    data: [
      ['阶段', '面积', '状态'],
      ['近期开放', '4,200', '测试'],
      ['中期更新', '9,100', '测试'],
      ['远期联动', '18,600', '测试'],
    ],
  });
  await callRequired(run, 'text.find_replace_text', {
    findText: '真实 E2E 自动生成文稿',
    replaceText: '真实 E2E 自动生成汇报',
  });
  await callRequired(run, 'text.find_text_in_document', {
    searchText: '东岸文化中心',
  });

  await callRequired(run, 'page.navigate_to_page', { pageIndex: 20 });
  await callRequired(run, 'graphics.place_image', {
    filePath: path.join(run.dirs.pathAssets, '滨水 图片.jpg'),
    x: 64,
    y: 150,
    width: 220,
    height: 150,
    fitMode: 'FILL_FRAME',
  });
  await callRequired(run, 'graphics.create_rectangle', {
    x: 320,
    y: 150,
    width: 120,
    height: 80,
    fillColor: 'E2E 工具青',
    strokeColor: 'Black',
    strokeWidth: 1,
  });
  await callRequired(run, 'graphics.create_ellipse', {
    x: 470,
    y: 150,
    width: 90,
    height: 90,
    fillColor: 'E2E 警示红',
    strokeColor: 'Black',
    strokeWidth: 1,
  });
  await callRequired(run, 'graphics.create_polygon', {
    x: 590,
    y: 150,
    width: 110,
    height: 90,
    sides: 6,
    fillColor: 'E2E 工具青',
    strokeColor: 'Black',
    strokeWidth: 1,
  });
  await callRequired(run, 'graphics.get_image_info', { itemIndex: 0 });

  await callRequired(run, 'page.place_file_on_page', {
    pageIndex: 10,
    filePath: svgPath(run, 'masterplan'),
    x: 80,
    y: 150,
    layerName: 'diagrams',
  });
  await callRequired(run, 'page.place_xml_on_page', {
    pageIndex: 23,
    xmlElementName: 'siteReport',
    x: 90,
    y: 440,
    autoflowing: false,
  });
  await callRequired(run, 'page.set_page_background', {
    pageIndex: 4,
    backgroundColor: 'E2E 工具青',
    opacity: 8,
  });
  await callRequired(run, 'page.get_page_item_info', { pageIndex: 20, itemIndex: 0 });
  await callRequired(run, 'page.select_page_item', { pageIndex: 20, itemIndex: 0 });
  await callRequired(run, 'page.move_page_item', { pageIndex: 20, itemIndex: 0, x: 70, y: 155 });
  await callRequired(run, 'page.resize_page_item', { pageIndex: 20, itemIndex: 0, width: 240, height: 160 });
  await callRequired(run, 'page.set_page_item_properties', {
    pageIndex: 20,
    itemIndex: 0,
    fillColor: 'E2E 工具青',
    strokeColor: 'Black',
    strokeWeight: 1,
    visible: true,
    locked: false,
  });
  await callRequired(run, 'page.duplicate_page_item', { pageIndex: 20, itemIndex: 0, x: 330, y: 155 });
  await callRequired(run, 'page.set_page_item_script_label', {
    mode: 'PAGE_ITEM',
    pageIndex: 20,
    itemIndex: 0,
    label: 'e2e.deck.page.21.materials.page-item-tool',
  });
  await callRequired(run, 'page.get_page_item_script_labels', {
    mode: 'ALL_WITH_LABELS',
  });
  await callRequired(run, 'page.list_page_items', { pageIndex: 20 });

  await callRequired(run, 'document.get_document_elements', { elementType: 'all' });
  await callRequired(run, 'document.get_document_styles', { styleType: 'all' });
  await callRequired(run, 'document.get_document_colors', { includeSwatches: true, includeGradients: true, includeTints: true });
  await callRequired(run, 'document.get_document_stories', { includeOverset: true, includeHidden: false });
  await callRequired(run, 'document.get_document_layers', { includeHidden: true, includeLocked: true });
  await callRequired(run, 'document.create_document_hyperlink', {
    sourceText: '东岸文化中心',
    destination: 'https://example.invalid/e2e-indesign',
    linkType: 'URL',
    pageIndex: 0,
  });
  await callRequired(run, 'document.get_document_hyperlinks', { includeDestinations: true, includeSources: true });
  await callRequired(run, 'document.create_document_section', {
    startPage: 5,
    sectionPrefix: 'E2E-',
    startNumber: 6,
    numberingStyle: 'ARABIC',
  });
  await callRequired(run, 'document.get_document_sections', {});
  await callRequired(run, 'document.get_document_grid_settings', {});
  await callRequired(run, 'document.set_document_grid_settings', { gridViewThreshold: 20 });
  await callRequired(run, 'document.view_document', {});

  await callRequired(run, 'document.save_document', { filePath: documentPath }, {
    artifact_paths: [relativeToRun(run, documentPath)],
  });
  const { auditPath } = await runAudit(run, 'content-assets');
  await writeCheckpoint(run, {
    phase: 'content_text_table',
    status: 'passed',
    open_documents_expected: [documentPath],
    main_document_path: documentPath,
    scratch_paths: [],
    next_phase: 'template_flow',
  });
  return {
    status: 'passed',
    auditPath: relativeToRun(run, auditPath),
  };
}

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

export async function runDestructiveScratch(run) {
  const mainPath = mainDocumentPath(run);
  const setupScript = await writeDestructiveScratchSetupScript(run);
  const scratchPath = path.join(run.dirs.outputs, 'destructive-scratch.indd');
  await scriptRunFile(run, setupScript, {
    artifact_paths: [relativeToRun(run, setupScript), relativeToRun(run, scratchPath)],
    note: 'create scratch document for destructive commands',
  });

  const indexScript = await writeScratchIndexScript(run);
  const indexCall = await scriptRunFile(run, indexScript, {
    artifact_paths: [relativeToRun(run, indexScript)],
    allowAnyText: true,
    note: 'inspect scratch group indexes',
  });
  let indexes = { groupIndex: 0, itemIndex: 1 };
  try {
    indexes = JSON.parse(semanticText(indexCall));
  } catch {}

  await callRequired(run, 'page.duplicate_page', { pageIndex: 0 });
  await callRequired(run, 'page.move_page', { pageIndex: 1, newPosition: 'AT_END', position: 'AT_END' });
  await callRequired(run, 'page.resize_page', { pageIndex: 0, width: 430, height: 300 });
  await callRequired(run, 'page.snapshot_page_layout', { pageIndex: 0 });
  await callRequired(run, 'page.delete_page_layout_snapshot', { pageIndex: 0 });
  await callRequired(run, 'page.delete_all_page_layout_snapshots', { pageIndex: 0 });
  await callRequired(run, 'page.reframe_page', { pageIndex: 0, x1: 0, y1: 0, x2: 420, y2: 297 });
  await callRequired(run, 'page.get_page_content_summary', { pageIndex: 0 });

  await callRequired(run, 'object.get_group_info', { pageIndex: 0, groupIndex: indexes.groupIndex });
  await callRequired(run, 'object.set_group_properties', {
    pageIndex: 0,
    groupIndex: indexes.groupIndex,
    visible: true,
    locked: false,
    name: 'E2E Scratch Group',
  });
  await callRequired(run, 'page.list_groups', { pageIndex: 0 });
  await callRequired(run, 'object.create_group_from_items', { pageIndex: 1, itemIndices: [0, 1] });
  await callRequired(run, 'object.create_group', { pageIndex: 0 });
  await callRequired(run, 'page.add_item_to_group', { pageIndex: 0, groupIndex: indexes.groupIndex, itemIndex: indexes.itemIndex });
  await callRequired(run, 'page.remove_item_from_group', { pageIndex: 0, groupIndex: indexes.groupIndex, itemIndex: 0 });
  await callRequired(run, 'object.ungroup', { pageIndex: 0, groupIndex: indexes.groupIndex });
  await callRequired(run, 'page.delete_page_item', { pageIndex: 0, itemIndex: 0 });

  await callRequired(run, 'spread.duplicate_spread', { spreadIndex: 0 });
  await callRequired(run, 'spread.move_spread', { spreadIndex: 1, position: 'AT_END' });
  await callRequired(run, 'spread.place_file_on_spread', {
    spreadIndex: 0,
    filePath: svgPath(run, 'section'),
    x: 260,
    y: 60,
    layerName: '',
  });
  await callRequired(run, 'spread.get_spread_content_summary', { spreadIndex: 0 });
  await callRequired(run, 'spread.delete_spread', { spreadIndex: 1 });

  await callRequired(run, 'master.detach_master_items', { pageIndex: 1 });
  await callRequired(run, 'master.remove_master_override', { pageIndex: 1, itemIndex: 0 });
  await callRequired(run, 'master.delete_master_spread', { name: 'Z-Scratch', masterIndex: 1 });
  await callRequired(run, 'document.organize_document_layers', { deleteEmptyLayers: false, sortLayers: true });
  await callRequired(run, 'document.get_session_info', {});
  await callRequired(run, 'document.clear_session', {});
  await callRequired(run, 'document.close_document', {});

  await callRequired(run, 'document.open_document', { filePath: mainPath }, {
    artifact_paths: [relativeToRun(run, mainPath)],
  });
  await writeCheckpoint(run, {
    phase: 'destructive_scratch',
    status: 'passed',
    open_documents_expected: [mainPath],
    main_document_path: mainPath,
    scratch_paths: [scratchPath],
    next_phase: 'presentation_hidden',
  });
  return { status: 'passed', scratchPath: relativeToRun(run, scratchPath) };
}

export async function runPresentationHidden(run) {
  const mainPath = mainDocumentPath(run);
  const presentationPath = path.join(run.dirs.outputs, 'presentation-hidden.indd');
  const presentationPdfPath = path.join(run.dirs.outputs, 'presentation-hidden.pdf');

  await callRequired(run, 'presentation.create_presentation_document', {
    preset: 'RATIO_16x9',
    pages: 1,
    facingPages: false,
  });
  await callRequired(run, 'presentation.add_cover_page', {
    title: '东岸文化中心',
    subtitle: 'CLI-Anything Presentation Handler E2E',
    bgImagePath: photoPath(run, 'hero-waterfront'),
  });

  await scriptRunFile(run, await writePresentationNavigationScript(run, 1, 'presentation-page-2.jsx'), {
    note: 'prepare presentation section page',
  });
  await callRequired(run, 'presentation.add_section_page', {
    title: '场地、策略与形体',
  });

  await scriptRunFile(run, await writePresentationNavigationScript(run, 2, 'presentation-page-3.jsx'), {
    note: 'prepare presentation full bleed page',
  });
  await callRequired(run, 'presentation.add_full_bleed_image', {
    filePath: photoPath(run, 'architecture-facade'),
    caption: '立面与材料测试页',
  });

  await scriptRunFile(run, await writePresentationNavigationScript(run, 3, 'presentation-page-4.jsx'), {
    note: 'prepare presentation image grid page',
  });
  await callRequired(run, 'presentation.add_image_grid', {
    files: [
      photoPath(run, 'hero-waterfront'),
      photoPath(run, 'industrial-site'),
      photoPath(run, 'urban-site'),
      photoPath(run, 'green-roof'),
      photoPath(run, 'brick-material'),
      photoPath(run, 'architecture-facade'),
    ],
    rows: 2,
    columns: 3,
    gap: 6,
  });

  await callRequired(run, 'document.save_document', { filePath: presentationPath }, {
    artifact_paths: [relativeToRun(run, presentationPath)],
    note: 'save presentation hidden handler fixture',
  });
  await callRequired(run, 'presentation.export_presentation_pdf', {
    filePath: presentationPdfPath,
    preset: 'High Quality Print',
  }, {
    artifact_paths: [relativeToRun(run, presentationPdfPath)],
  });
  await callRequired(run, 'export.verify', { path: presentationPdfPath }, {
    artifact_paths: [relativeToRun(run, presentationPdfPath)],
    note: 'verify presentation hidden handler PDF',
  });
  await callRequired(run, 'document.close_document', {});
  await callRequired(run, 'document.open_document', { filePath: mainPath }, {
    artifact_paths: [relativeToRun(run, mainPath)],
  });

  await writeCheckpoint(run, {
    phase: 'presentation_hidden',
    status: 'passed',
    open_documents_expected: [mainPath],
    main_document_path: mainPath,
    scratch_paths: [presentationPath],
    next_phase: 'book_hidden',
  });
  return {
    status: 'passed',
    presentationPath: relativeToRun(run, presentationPath),
    presentationPdfPath: relativeToRun(run, presentationPdfPath),
  };
}

export async function runBookHidden(run) {
  const mainPath = mainDocumentPath(run);
  const fixtureScript = await writeBookFixtureScript(run);
  const bookPath = path.join(run.dirs.outputs, 'architecture-book.indb');
  const docAPath = path.join(run.dirs.pathBook, 'chapter-01-site.indd');
  const docBPath = path.join(run.dirs.pathBook, 'chapter-02-design.indd');
  const bookPdfPath = path.join(run.dirs.outputs, 'architecture-book.pdf');
  const bookPackagePath = path.join(run.dirs.outputs, 'book-package');
  const preflightPath = path.join(run.dirs.outputs, 'book-preflight.txt');
  const missingPrintPath = path.join(run.dirs.outputs, 'missing-print-target.indb');

  await scriptRunFile(run, fixtureScript, {
    artifact_paths: [relativeToRun(run, fixtureScript), relativeToRun(run, docAPath), relativeToRun(run, docBPath)],
    note: 'create two saved InDesign chapter documents for book tools',
  });

  await callRequired(run, 'book.create_book', { filePath: bookPath }, {
    artifact_paths: [relativeToRun(run, bookPath)],
  });
  await callRequired(run, 'book.open_book', { filePath: bookPath });
  await callRequired(run, 'book.list_books', {});
  await scriptRunFile(run, await writeCloseBooksScript(run), {
    note: 'reset open Book state after open_book/list_books coverage',
  });
  await callRequired(run, 'book.add_document_to_book', { bookPath, documentPath: docAPath });
  await callRequired(run, 'book.add_document_to_book', { bookPath, documentPath: docBPath });
  await callRequired(run, 'book.get_book_info', { bookPath });
  await callRequired(run, 'book.set_book_properties', {
    bookPath,
    automaticPagination: true,
    automaticDocumentConversion: true,
    insertBlankPage: false,
    mergeIdenticalLayers: false,
    synchronizeParagraphStyle: true,
    synchronizeCharacterStyle: true,
    synchronizeSwatch: true,
  });
  await callRequired(run, 'book.synchronize_book', { bookPath });
  await callRequired(run, 'book.repaginate_book', { bookPath });
  await callRequired(run, 'book.update_all_cross_references', { bookPath });
  await callRequired(run, 'book.update_all_numbers', { bookPath });
  await callRequired(run, 'book.update_chapter_and_paragraph_numbers', { bookPath });
  await callRequired(run, 'book.preflight_book', {
    bookPath,
    outputPath: preflightPath,
    autoOpen: false,
  }, {
    artifact_paths: [relativeToRun(run, preflightPath)],
  });
  await callRequired(run, 'book.export_book', {
    bookPath,
    outputPath: bookPdfPath,
    format: 'PDF',
  }, {
    artifact_paths: [relativeToRun(run, bookPdfPath)],
  });
  await callRequired(run, 'book.package_book', {
    bookPath,
    outputPath: bookPackagePath,
    copyingFonts: false,
    copyingLinkedGraphics: true,
    copyingProfiles: false,
    updatingGraphics: false,
    includingHiddenLayers: false,
    ignorePreflightErrors: true,
    creatingReport: true,
    includeIdml: false,
    includePdf: false,
  }, {
    artifact_paths: [relativeToRun(run, bookPackagePath)],
  });
  await callExpectedFailure(run, 'book.print_book', {
    bookPath: missingPrintPath,
    printDialog: false,
    printerPreset: 'DEFAULT_VALUE',
  }, /Book file not found/i, {
    note: 'print_book is covered through safe missing-file guard to avoid sending a print job',
  });

  await callRequired(run, 'document.open_document', { filePath: mainPath }, {
    artifact_paths: [relativeToRun(run, mainPath)],
  });
  await writeCheckpoint(run, {
    phase: 'book_hidden',
    status: 'passed',
    open_documents_expected: [mainPath],
    main_document_path: mainPath,
    scratch_paths: [docAPath, docBPath, bookPath],
    next_phase: 'export_package',
  });
  return {
    status: 'passed',
    bookPath: relativeToRun(run, bookPath),
    bookPdfPath: relativeToRun(run, bookPdfPath),
  };
}

export async function runExportPackage(run) {
  const documentPath = mainDocumentPath(run);
  const pdfPath = path.join(run.dirs.outputs, 'architecture-presentation.pdf');
  const imagesPath = path.join(run.dirs.outputs, 'page-images');
  const epubPath = path.join(run.dirs.outputs, 'architecture-presentation.epub');
  const packagePath = run.dirs.pathPackage;
  const cleanupScript = await writeMainDeckFinalCleanupScript(run);

  await callRequired(run, 'document.open_document', { filePath: documentPath }, {
    artifact_paths: [relativeToRun(run, documentPath)],
  });
  await callRequired(run, 'page.delete_page', { pageIndex: 28 });
  await scriptRunFile(run, cleanupScript, {
    artifact_paths: [relativeToRun(run, cleanupScript)],
    note: 'ensure main architecture deck returns to 28 pages before export',
  });
  const { auditPath } = await runAudit(run, 'final-export-ready');

  await callRequired(run, 'export.export_pdf', {
    filePath: pdfPath,
    pages: 'all',
    quality: 'PRINT',
    includeBleed: true,
    includeMarks: false,
  }, {
    artifact_paths: [relativeToRun(run, pdfPath)],
  });
  await callRequired(run, 'export.verify', { path: pdfPath }, {
    artifact_paths: [relativeToRun(run, pdfPath)],
    audit_refs: [relativeToRun(run, auditPath)],
    note: 'verify final architecture presentation PDF',
  });
  await callRequired(run, 'export.export_images', {
    outputPath: imagesPath,
    format: 'JPEG',
    resolution: 144,
    quality: 80,
    pages: '1-4',
  }, {
    artifact_paths: [relativeToRun(run, imagesPath)],
  });
  await callRequired(run, 'export.export_epub', {
    filePath: epubPath,
  }, {
    artifact_paths: [relativeToRun(run, epubPath)],
  });
  await callRequired(run, 'export.package_document', {
    outputPath: packagePath,
    includeFonts: false,
    includeLinks: true,
    includeProfiles: false,
  }, {
    artifact_paths: [relativeToRun(run, packagePath)],
  });
  await callRequired(run, 'document.save_document', { filePath: documentPath }, {
    artifact_paths: [relativeToRun(run, documentPath)],
  });

  await writeCheckpoint(run, {
    phase: 'export_package',
    status: 'passed',
    open_documents_expected: [documentPath],
    main_document_path: documentPath,
    scratch_paths: [],
    next_phase: 'complete',
  });
  return {
    status: 'passed',
    pdfPath: relativeToRun(run, pdfPath),
    imagesPath: relativeToRun(run, imagesPath),
    epubPath: relativeToRun(run, epubPath),
    packagePath: relativeToRun(run, packagePath),
  };
}
