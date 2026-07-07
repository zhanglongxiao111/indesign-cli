export const mutatingGraphicsContract = {
    needsInDesign: true,
    requiresActiveDocument: true,
    mutatesDocument: true,
    writesFilesystem: false,
    producesArtifacts: false,
    destructive: false
};

export const inspectingGraphicsContract = {
    needsInDesign: true,
    requiresActiveDocument: true,
    mutatesDocument: false,
    writesFilesystem: false,
    producesArtifacts: false,
    destructive: false
};

