import {
    buildSlotValuesScript,
    defineTemplateTool,
    escapeFilePathForJsx,
    escapeJsxString,
    FIT_RESOLVER_SNIPPET,
    formatErrorResponse,
    formatResponse,
    JSON_HELPERS_SNIPPET,
    LABEL_PARSER_SNIPPET,
    normalizeFsPathForJsx,
    parseTemplateJsonResult,
    runScript,
    SLOT_COLLECTION_SNIPPET,
    templateContract
} from './_shared.js';
import { populateTemplateSlotsSchema } from './schemas.js';

export async function populateTemplateSlots(args) {
    const { templatePath, outputPath, values, pageIndex } = args || {};
    if (!values || typeof values !== 'object' || !Object.keys(values).length) {
        return formatErrorResponse('values 必须是包含至少一个槽位的对象。', 'Populate Template Slots');
    }

    const hasPath = typeof templatePath === 'string' && templatePath.trim().length > 0;
    const templatePathJsx = hasPath ? escapeFilePathForJsx(templatePath) : '';
    const normalizedTemplatePath = hasPath ? normalizeFsPathForJsx(templatePath) : '';
    const slotValuesScript = buildSlotValuesScript(values);
    const outputPathProvided = outputPath && typeof outputPath === 'string' && outputPath.trim().length;
    const outputPathJsx = outputPathProvided ? escapeFilePathForJsx(outputPath) : '';

    const scriptParts = [
        JSON_HELPERS_SNIPPET,
        LABEL_PARSER_SNIPPET,
        SLOT_COLLECTION_SNIPPET,
        FIT_RESOLVER_SNIPPET,
        slotValuesScript,
        `
var templatePath = "${templatePathJsx}";
var useActive = ${hasPath ? 'false' : 'true'};
var doc = null;
var templateFsPath = "";
var templateDisplayPath = "${escapeJsxString(normalizedTemplatePath)}";
var __mcpResult = null;
var targetPageIndex = ${Number.isInteger(pageIndex) ? pageIndex : 'null'};

function __mcpCollectSlotTargetsFromItem(item, slotTargets, context) {
  if (!item || !item.isValid) return;
  if (item.itemLayer && item.itemLayer.isValid && item.itemLayer.name === "PageNotes") return;
  if (item.label && item.label !== "") {
    var parsed = __mcpParseSlotLabel(item.label);
    if (parsed.slotName) {
      if (!slotTargets[parsed.slotName]) {
        slotTargets[parsed.slotName] = [];
      }
      slotTargets[parsed.slotName].push({
        item: item,
        parsed: parsed,
        context: context
      });
    }
  }
  var childItems = null;
  try {
    childItems = item.pageItems;
  } catch (_childErr) {
    childItems = null;
  }
  if (childItems && childItems.length) {
    for (var c = 0; c < childItems.length; c++) {
      __mcpCollectSlotTargetsFromItem(childItems[c], slotTargets, context);
    }
  }
}

function __mcpCollectSlotTargetsFromItems(items, slotTargets, context) {
  if (!items || !items.length) return;
  for (var idx = 0; idx < items.length; idx++) {
    __mcpCollectSlotTargetsFromItem(items[idx], slotTargets, context);
  }
}

if (useActive) {
  if (app.documents.length === 0) {
    __mcpResult = { success: false, error: "没有打开的文档，请提供模板路径或先打开文档。" };
  } else {
    doc = app.activeDocument;
    templateFsPath = doc.fullName ? doc.fullName.fsName : "";
    templateDisplayPath = templateFsPath || doc.name;
  }
} else {
  var templateFile = File(templatePath);
  if (!templateFile.exists) {
    __mcpResult = { success: false, error: "模板文件不存在: " + templatePath };
  } else {
    doc = app.open(templateFile, false);
    templateFsPath = templateFile.fsName;
    templateDisplayPath = "${escapeJsxString(normalizedTemplatePath)}";
  }
}

var templatePathJson = templateDisplayPath ? String(templateDisplayPath).replace(/\\\\/g, '/') : "";
var templateFsPathJson = templateFsPath ? String(templateFsPath).replace(/\\\\/g, '/') : "";

var report = {
  templatePath: templatePathJson,
  templateFsPath: templateFsPathJson,
  applied: [],
  warnings: [],
  missingSlots: [],
  savedPath: ""
};

try {
  if (!__mcpResult) {
    var slotTargets = {};
    for (var p = 0; p < doc.pages.length; p++) {
      var page = doc.pages[p];
      if (targetPageIndex !== null && p !== targetPageIndex) {
        continue;
      }
      __mcpCollectSlotTargetsFromItems(
        page.pageItems,
        slotTargets,
        { type: "page", pageIndex: p, pageName: page.name }
      );
    }

    for (var key in slotValues) {
      if (!slotValues.hasOwnProperty(key)) continue;
      var value = slotValues[key];
      var targets = slotTargets[key];
      if (!targets || !targets.length) {
        report.missingSlots.push(key);
        continue;
      }
      var filteredTargets = [];
      for (var tIndex = 0; tIndex < targets.length; tIndex++) {
        var ctx = targets[tIndex].context || {};
        if (targetPageIndex !== null && ctx.pageIndex !== targetPageIndex) {
          continue;
        }
        filteredTargets.push(targets[tIndex]);
      }
      if (targetPageIndex !== null) {
        targets = filteredTargets;
      }
      if (!targets.length) {
        report.missingSlots.push(key + "(页面 " + targetPageIndex + ")");
        continue;
      }
      for (var t = 0; t < targets.length; t++) {
        var target = targets[t];
        var frame = target.item;
        if (!frame || !frame.isValid) continue;
        var frameType = frame.constructor ? frame.constructor.name : "";
        var appliedDetail = {
          slotName: key,
          pageIndex: target.context ? target.context.pageIndex : null,
          pageName: target.context ? target.context.pageName : "",
          frameType: frameType,
          actions: []
        };

        if (value.text !== undefined) {
          var applyTextResult = (function() {
            var queue = [frame];
            var visited = {};
            while (queue.length) {
              var current = queue.shift();
              if (!current || !current.isValid) continue;
              var idKey = "";
              try { idKey = String(current.id); } catch(_idErr) {}
              if (idKey && visited[idKey]) continue;
              if (idKey) visited[idKey] = true;

              try {
                current.contents = value.text;
                if (current.contents === value.text) {
                  return { success: true, targetType: current.constructor ? current.constructor.name : frameType };
                }
              } catch(_tryText) {}

              try {
                var texts = current.texts;
                if (texts && texts.length) {
                  texts[0].contents = value.text;
                  return { success: true, targetType: current.constructor ? current.constructor.name : frameType };
                }
              } catch(_textsErr) {}

              try {
                var tf = current.textFrames;
                if (tf && tf.length) {
                  for (var ti = 0; ti < tf.length; ti++) {
                    try {
                      tf[ti].contents = value.text;
                      if (tf[ti].contents === value.text) {
                        return { success: true, targetType: tf[ti].constructor ? tf[ti].constructor.name : frameType };
                      }
                    } catch(_textFrameErr) {}
                  }
                }
              } catch(_tfErr) {}

              try {
                var elements = current.getElements();
                if (elements && elements.length) {
                  for (var ei = 0; ei < elements.length; ei++) {
                    var el = elements[ei];
                    try {
                      if (typeof el.contents !== 'undefined') {
                        el.contents = value.text;
                        if (el.contents === value.text) {
                          return { success: true, targetType: el.constructor ? el.constructor.name : frameType };
                        }
                      }
                    } catch(_elementsErr) {}
                  }
                }
              } catch(_getElementsErr) {}

              try {
                var children = current.pageItems;
                if (children && children.length) {
                  for (var ci = 0; ci < children.length; ci++) {
                    queue.push(children[ci]);
                  }
                }
              } catch(_childErr) {}
            }
            return { success: false };
          })();

          if (applyTextResult.success) {
            appliedDetail.actions.push("text(" + applyTextResult.targetType + ")");
          } else {
            report.warnings.push("槽位 " + key + " 文本填充失败：未找到可写入的文本对象");
          }
        }

        if (value.imagePath !== undefined) {
          var imgFile = File(value.imagePath);
          if (!imgFile.exists) {
            report.warnings.push("槽位 " + key + " 图片不存在: " + value.imagePath);
          } else {
            var applyImageResult = (function() {
              var queueImg = [frame];
              var visitedImg = {};
              while (queueImg.length) {
                var currentImg = queueImg.shift();
                if (!currentImg || !currentImg.isValid) continue;
                var idKeyImg = "";
                try { idKeyImg = String(currentImg.id); } catch(_imgIdErr) {}
                if (idKeyImg && visitedImg[idKeyImg]) continue;
                if (idKeyImg) visitedImg[idKeyImg] = true;

                try {
                  if (value.clearExisting === true && currentImg.graphics && currentImg.graphics.length) {
                    for (var g = currentImg.graphics.length - 1; g >= 0; g--) {
                      try { currentImg.graphics[g].remove(); } catch (_removeErr) {}
                    }
                  }
                } catch(_clearErr) {}

                try {
                  var placed = currentImg.place(imgFile);
                  if (placed) {
                    var fitName = value.fit || "PROPORTIONALLY";
                    try {
                      var fitOption = __mcpResolveFitOption(fitName);
                      if (fitOption) {
                        currentImg.fit(fitOption);
                      }
                    } catch(_fitErr) {}
                    return { success: true, targetType: currentImg.constructor ? currentImg.constructor.name : frameType };
                  }
                } catch(placeErr) {}

                try {
                  var childItemsImg = currentImg.pageItems;
                  if (childItemsImg && childItemsImg.length) {
                    for (var cj = 0; cj < childItemsImg.length; cj++) {
                      queueImg.push(childItemsImg[cj]);
                    }
                  }
                } catch(_imgChildErr) {}
              }
              return { success: false };
            })();

            if (applyImageResult.success) {
              appliedDetail.actions.push("image(" + applyImageResult.targetType + ")");
            } else {
              report.warnings.push("槽位 " + key + " 图片填充失败：未找到可放置的图形对象");
            }
          }
        }

        if (appliedDetail.actions.length) {
          report.applied.push(appliedDetail);
        }
      }
    }

    for (var targetSlot in slotTargets) {
      if (!slotTargets.hasOwnProperty(targetSlot)) continue;
      if (!slotValues.hasOwnProperty(targetSlot)) {
        report.warnings.push("模板槽位 " + targetSlot + " 未提供填充数据");
      }
    }

    ${outputPathProvided ? `
    var outputFile = File("${outputPathJsx}");
    try {
      if (outputFile.parent && !outputFile.parent.exists) {
        outputFile.parent.create();
      }
    } catch (_mkdirErr) {}
    doc.save(outputFile);
    report.savedPath = outputFile.fsName ? String(outputFile.fsName).replace(/\\\\/g, '/') : "";
    ` : ''}

    __mcpResult = { success: true, data: report };
  }
} catch (err) {
  __mcpResult = { success: false, error: err.message || String(err) };
} finally {
  if (!useActive && doc && doc.isValid) {
    doc.close(SaveOptions.NO);
  }
  __mcpSerialize(__mcpResult || { success: false, error: "未知错误" });
}
`
    ];

    const script = scriptParts.join('\n');

    try {
        const rawResult = await runScript(script);
        const data = parseTemplateJsonResult(rawResult, 'Populate Template Slots');
        return formatResponse(data, 'Populate Template Slots');
    } catch (error) {
        return formatErrorResponse(error.message, 'Populate Template Slots');
    }
}

export const populateTemplateSlotsTool = defineTemplateTool({
    name: 'populate_template_slots',
    description: '根据 inspect 结果返回的槽位名称，批量填充文本与图片，并可另存为成品文档。',
    contract: templateContract({ mutatesDocument: true }),
    inputSchema: populateTemplateSlotsSchema,
    handler: populateTemplateSlots
});

export const tools = [populateTemplateSlotsTool];
