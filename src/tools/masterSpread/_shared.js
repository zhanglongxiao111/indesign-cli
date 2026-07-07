export const DOMAIN = 'masterSpread';
export const PROFILES = ['classic'];

export function contract(overrides = {}) {
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

export function readOnlyContract(overrides = {}) {
    return contract({
        mutatesDocument: false,
        ...overrides
    });
}
