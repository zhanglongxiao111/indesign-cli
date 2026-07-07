import { runScript, formatResponse } from '../../core/runtime.js';
import { defineTool } from '../_contract.js';

const viewDocumentContract = {
    needsInDesign: true,
    requiresActiveDocument: true,
    mutatesDocument: true,
    writesFilesystem: false,
    producesArtifacts: false,
    destructive: false
};

export const viewDocument = defineTool({
    name: 'view_document',
    description: 'View document information and current state',
    domain: 'utility',
    profiles: ['classic'],
    cli: { id: 'document.view_document', aliases: [] },
    contract: viewDocumentContract,
    inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {}
    },
    handler: async () => {
        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            '  var activePage = null;',
            '  try { if (app.layoutWindows.length > 0) activePage = app.layoutWindows[0].activePage; } catch (activePageError) {}',
            '  if (!activePage && doc.pages.length > 0) activePage = doc.pages[0];',
            '  var info = "=== DOCUMENT VIEW ===\\n";',
            '  info += "Document: " + doc.name + "\\n";',
            '  info += "Pages: " + doc.pages.length + "\\n";',
            '  info += "Active Page: " + (activePage ? activePage.name : "None") + "\\n";',
            '  try { info += "Zoom: " + app.activeWindow.zoomPercentage + "%\\n"; } catch (zoomError) { info += "Zoom: Not available\\n"; }',
            '  try { info += "View Mode: " + app.activeWindow.displaySettings.overprintPreview + "\\n"; } catch (viewError) { info += "View Mode: Not available\\n"; }',
            '',
            '  // Page information',
            '  if (doc.pages.length > 0) {',
            '    var page = doc.pages[0];',
            '    info += "\\n=== FIRST PAGE INFO ===\\n";',
            '    info += "Page Name: " + page.name + "\\n";',
            '    info += "Page Width: " + (page.bounds[3] - page.bounds[1]) + "\\n";',
            '    info += "Page Height: " + (page.bounds[2] - page.bounds[0]) + "\\n";',
            '    info += "Text Frames: " + page.textFrames.length + "\\n";',
            '    info += "Rectangles: " + page.rectangles.length + "\\n";',
            '    info += "Ovals: " + page.ovals.length + "\\n";',
            '    info += "Polygons: " + page.polygons.length + "\\n";',
            '  }',
            '',
            '  info;',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, 'View Document');
    }
});

export const tools = [viewDocument];
