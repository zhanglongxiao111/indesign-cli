import fs from 'node:fs/promises';
import path from 'node:path';

import { runCli, toolCall } from '../lib/cli.mjs';
export { runCli, toolCall };
import { recordCallCoverage } from '../lib/coverage.mjs';
export { recordCallCoverage };
import { relativeToRun, writeCheckpoint, writeJson } from '../lib/run-dir.mjs';
export { relativeToRun, writeCheckpoint, writeJson };

export const MAIN_DOCUMENT_NAME = 'architecture-presentation.indd';

export function jsxString(value) {
  return JSON.stringify(String(value ?? ''))
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export function jsxPath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/"/g, '\\"');
}

export function coverageSource(toolId) {
  const domain = toolId.split('.')[0];
  if (['server', 'session'].includes(domain) || toolId === 'export.verify') return 'cli';
  if (domain === 'script') return 'script';
  if (domain === 'template') return 'advanced';
  return 'classic';
}

export function semanticText(call) {
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

export function isSemanticallyOk(call) {
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

export async function callRequired(run, toolId, args = {}, options = {}) {
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

export async function callExpectedFailure(run, toolId, args = {}, expectedPattern = /not found|Error|failed/i, options = {}) {
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

export async function scriptRunFile(run, scriptPath, options = {}) {
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

export async function loadDeckBrief(run) {
  const filePath = path.join(run.realE2eRoot, 'deck-brief.json');
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

export async function writeDeckSkeletonScript(run, brief) {
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

export function photoPath(run, name) {
  return path.join(run.dirs.assets, 'photos', `${name}.jpg`);
}

export function svgPath(run, name) {
  return path.join(run.dirs.assets, 'svg', `${name}.svg`);
}

export function dataPath(run, name) {
  return path.join(run.dirs.assets, 'data', name);
}

export async function writePopulateContentScript(run, brief) {
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

export async function writeTemplateSetupScript(run) {
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

export async function writeDestructiveScratchSetupScript(run) {
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

export async function writeScratchIndexScript(run) {
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

export async function writeBookFixtureScript(run) {
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

export async function writeCloseBooksScript(run) {
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

export async function writePresentationNavigationScript(run, pageIndex, scriptName) {
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

export async function writeMainDeckFinalCleanupScript(run) {
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

export async function runAudit(run, name = 'main-deck-structure') {
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
