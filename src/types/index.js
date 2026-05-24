/**
 * Tool definitions index for InDesign MCP Server
 * Central import and export of all tool definitions
 */

import { pageToolDefinitions as rawPageToolDefinitions } from './toolDefinitionsPage.js';
import { contentToolDefinitions as rawContentToolDefinitions } from './toolDefinitionsContent.js';
import { documentToolDefinitions as rawDocumentToolDefinitions } from './toolDefinitionsDocument.js';
import { exportToolDefinitions as rawExportToolDefinitions } from './toolDefinitionsExport.js';
import { presentationToolDefinitions as rawPresentationToolDefinitions } from './toolDefinitionsPresentation.js';
import { bookToolDefinitions as rawBookToolDefinitions } from './toolDefinitionsBook.js';
import { utilityToolDefinitions as rawUtilityToolDefinitions } from './toolDefinitionsUtility.js';
import { pageItemGroupToolDefinitions as rawPageItemGroupToolDefinitions } from './toolDefinitionsPageItemGroup.js';
import { masterSpreadToolDefinitions as rawMasterSpreadToolDefinitions } from './toolDefinitionsMasterSpread.js';
import { spreadToolDefinitions as rawSpreadToolDefinitions } from './toolDefinitionsSpread.js';
import { layerToolDefinitions as rawLayerToolDefinitions } from './toolDefinitionsLayer.js';

// Normalize schemas to comply with JSON Schema 2020-12 strictness
function normalizeSchema(schema) {
  if (!schema || typeof schema !== 'object') return schema;

  let normalized = { ...schema };

  // Recurse common combinators
  for (const key of ['anyOf', 'oneOf', 'allOf']) {
    if (Array.isArray(normalized[key])) {
      normalized[key] = normalized[key].map((s) => normalizeSchema(s));
    }
  }

  if (normalized.type === 'object') {
    if (!Object.prototype.hasOwnProperty.call(normalized, 'additionalProperties')) {
      normalized.additionalProperties = false;
    }
    const requiredFromChildren = [];
    if (normalized.properties && typeof normalized.properties === 'object') {
      const newProps = {};
      for (const [k, v] of Object.entries(normalized.properties)) {
        // Capture non-standard property-level required: true
        if (v && typeof v === 'object' && Object.prototype.hasOwnProperty.call(v, 'required')) {
          if (v.required === true) {
            requiredFromChildren.push(k);
          }
          // Remove invalid usage regardless of value type
          const { required, ...rest } = v;
          newProps[k] = normalizeSchema(rest);
        } else {
          newProps[k] = normalizeSchema(v);
        }
      }
      normalized.properties = newProps;
    }
    if (requiredFromChildren.length) {
      const existing = Array.isArray(normalized.required) ? normalized.required.slice() : [];
      for (const r of requiredFromChildren) {
        if (!existing.includes(r)) existing.push(r);
      }
      normalized.required = existing;
    }
  }

  if (normalized.type === 'array' && normalized.items) {
    normalized.items = normalizeSchema(normalized.items);
  }

  return normalized;
}

function normalizeToolDefinition(tool) {
  if (!tool || typeof tool !== 'object') return tool;
  const t = { ...tool };
  if (t.inputSchema) {
    t.inputSchema = normalizeSchema(t.inputSchema);
  }
  return t;
}

// Produce normalized exports used by the server
export const pageToolDefinitions = rawPageToolDefinitions.map(normalizeToolDefinition);
export const contentToolDefinitions = rawContentToolDefinitions.map(normalizeToolDefinition);
export const documentToolDefinitions = rawDocumentToolDefinitions.map(normalizeToolDefinition);
export const exportToolDefinitions = rawExportToolDefinitions.map(normalizeToolDefinition);
export const presentationToolDefinitions = rawPresentationToolDefinitions.map(normalizeToolDefinition);
export const bookToolDefinitions = rawBookToolDefinitions.map(normalizeToolDefinition);
export const utilityToolDefinitions = rawUtilityToolDefinitions.map(normalizeToolDefinition);
export const pageItemGroupToolDefinitions = rawPageItemGroupToolDefinitions.map(normalizeToolDefinition);
export const masterSpreadToolDefinitions = rawMasterSpreadToolDefinitions.map(normalizeToolDefinition);
export const spreadToolDefinitions = rawSpreadToolDefinitions.map(normalizeToolDefinition);
export const layerToolDefinitions = rawLayerToolDefinitions.map(normalizeToolDefinition);

// Combine all tool definitions into a single array
export const allToolDefinitions = [
    ...pageToolDefinitions,
    ...contentToolDefinitions,
    ...documentToolDefinitions,
    ...exportToolDefinitions,
    ...presentationToolDefinitions,
    ...bookToolDefinitions,
    ...utilityToolDefinitions,
    ...pageItemGroupToolDefinitions,
    ...masterSpreadToolDefinitions,
    ...spreadToolDefinitions,
    ...layerToolDefinitions,
];

// Named exports already declared above
