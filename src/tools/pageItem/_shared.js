import { runScript, formatResponse, formatErrorResponse } from '../../core/runtime.js';
import { escapeJsxString } from '../../utils/stringUtils.js';
import { defineTool } from '../_contract.js';

export const DOMAIN = 'pageItem';
export const PROFILES = ['classic'];

export const JSON_SERIALIZER_SNIPPET = `
function __mcpEscapeJsonString(str) {
  if (str === null || str === undefined) return "";
  var result = "";
  for (var i = 0; i < str.length; i++) {
    var ch = str.charAt(i);
    var code = str.charCodeAt(i);
    if (ch === '"' || ch === '\\\\') {
      result += '\\\\' + ch;
    } else if (code === 8) {
      result += '\\\\b';
    } else if (code === 9) {
      result += '\\\\t';
    } else if (code === 10) {
      result += '\\\\n';
    } else if (code === 12) {
      result += '\\\\f';
    } else if (code === 13) {
      result += '\\\\r';
    } else if (code < 32) {
      var hex = code.toString(16);
      result += '\\\\u' + ('0000' + hex).slice(-4);
    } else {
      result += ch;
    }
  }
  return result;
}
function __mcpSerializeValue(value) {
  if (value === null || value === undefined) return "null";
  var type = typeof value;
  if (type === "number" || type === "boolean") {
    return String(value);
  }
  if (type === "string") {
    return "\\""+__mcpEscapeJsonString(value)+"\\"";
  }
  if (value instanceof Array) {
    var arr = [];
    for (var i = 0; i < value.length; i++) {
      arr.push(__mcpSerializeValue(value[i]));
    }
    return "[" + arr.join(",") + "]";
  }
  if (type === "object") {
    var props = [];
    for (var key in value) {
      if (!value.hasOwnProperty(key)) continue;
      var propertyValue = value[key];
      if (propertyValue === undefined) continue;
      props.push("\\"" + __mcpEscapeJsonString(key) + "\\":" + __mcpSerializeValue(propertyValue));
    }
    return "{" + props.join(",") + "}";
  }
  return "null";
}
function __mcpSerializeResponse(success, payload, errorMessage) {
  var response = { success: success ? true : false };
  if (response.success) {
    response.data = (payload === undefined) ? [] : payload;
  } else {
    response.error = errorMessage || "";
  }
  return __mcpSerializeValue(response);
}
`;

export const PAGE_ITEM_LABEL_HELPERS_SNIPPET = `
function __mcpFindPageByNumber(doc, pageNumber) {
  if (!doc || !doc.isValid) return null;
  for (var i = 0; i < doc.pages.length; i++) {
    var page = doc.pages[i];
    try {
      if ((page.documentOffset + 1) === pageNumber) {
        return page;
      }
    } catch (_offsetErr) {}
  }
  return null;
}
function __mcpFindItemIndexOnPage(page, itemId) {
  if (!page || !page.isValid) return -1;
  var items = page.allPageItems;
  for (var i = 0; i < items.length; i++) {
    if (items[i].id === itemId) {
      return i;
    }
  }
  return -1;
}
function __mcpFindItemById(page, objectId) {
  if (!page || !page.isValid) return null;
  var items = page.allPageItems;
  for (var i = 0; i < items.length; i++) {
    if (items[i].id === objectId) {
      return items[i];
    }
  }
  return null;
}
`;

export function pageItemContract(overrides = {}) {
    return {
        needsInDesign: true,
        requiresActiveDocument: false,
        mutatesDocument: true,
        writesFilesystem: false,
        producesArtifacts: false,
        destructive: false,
        ...overrides
    };
}

export function definePageItemTool({ name, description, inputSchema, contract, handler }) {
    return defineTool({
        name,
        description,
        domain: DOMAIN,
        profiles: PROFILES,
        cli: { id: `page.${name}`, aliases: [] },
        contract,
        inputSchema,
        handler
    });
}

export function parsePageItemJsonResult(raw, operationName) {
    const trimmed = (raw ?? '').trim();
    if (!trimmed) {
        return { success: true, data: [] };
    }
    if (trimmed.startsWith('Error:')) {
        const message = trimmed.slice(6).trim() || `${operationName} failed inside InDesign`;
        return { success: false, error: message };
    }
    let parsed;
    try {
        parsed = JSON.parse(trimmed);
    } catch (error) {
        return { success: false, error: `Unable to parse InDesign response for ${operationName}: ${error.message}` };
    }
    if (!parsed || typeof parsed !== 'object') {
        return { success: false, error: `${operationName} returned an unexpected result` };
    }
    if (parsed.success === false) {
        return { success: false, error: parsed.error || `${operationName} failed` };
    }
    return { success: true, data: parsed.data ?? [] };
}

export { runScript, formatResponse, formatErrorResponse, escapeJsxString };
