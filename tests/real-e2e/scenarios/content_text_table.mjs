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
