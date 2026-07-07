import { createPageWithTemplateTool } from './composition.js';
import {
    getPageInformationTool,
    inspectTemplateBlueprintTool,
    listTemplateBlueprintsTool
} from './inspection.js';
import { populateTemplateSlotsTool } from './population.js';
import { runJsxFileTool } from './fileRunner.js';

export const tools = [
    createPageWithTemplateTool,
    getPageInformationTool,
    inspectTemplateBlueprintTool,
    listTemplateBlueprintsTool,
    populateTemplateSlotsTool,
    runJsxFileTool
];
