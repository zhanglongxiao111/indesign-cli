export const mutateStyleContract = {
    needsInDesign: true,
    requiresActiveDocument: false,
    mutatesDocument: true,
    writesFilesystem: false,
    producesArtifacts: false,
    destructive: false
};

export const createStyleContract = {
    ...mutateStyleContract,
    requiresActiveDocument: true
};

export const readStyleContract = {
    needsInDesign: true,
    requiresActiveDocument: false,
    mutatesDocument: false,
    writesFilesystem: false,
    producesArtifacts: false,
    destructive: false
};
