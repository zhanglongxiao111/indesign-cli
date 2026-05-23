/**
 * Utility functions for string handling and escaping.
 */

/**
 * Escapes backslashes, double quotes, and control characters for JSX/AppleScript.
 * @param {string} str - The string to escape.
 * @returns {string} The escaped string.
 */
export function escapeJsxString(str) {
    if (typeof str !== 'string') return '';
    return str
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\r/g, '\\r')
        .replace(/\n/g, '\\n')
        .replace(/\t/g, '\\t');
}

/**
 * Formats a response with a consistent structure.
 * @param {any} result - The result to format.
 * @param {string} [operation="Operation"] - The operation name.
 * @returns {object} Formatted response object.
 */
export function formatResponse(result, operation = "Operation") {
    return {
        success: true,
        operation,
        result,
        timestamp: new Date().toISOString()
    };
}

/**
 * Formats an error response with a consistent structure.
 * @param {any} error - The error to format.
 * @param {string} [operation="Operation"] - The operation name.
 * @returns {object} Formatted error response object.
 */
export function formatErrorResponse(error, operation = "Operation") {
    return {
        success: false,
        operation,
        result: error,
        timestamp: new Date().toISOString()
    };
}

/**
 * Normalize a filesystem path string for ExtendScript File/Folder usage.
 * - Converts Windows backslashes to forward slashes
 * - Handles UNC paths (\\\\server\share -> //server/share)
 * - Handles file:// URLs by converting to local/UNC paths
 * - Decodes URL-encoded characters to support Chinese/space paths
 * This returns a plain string (not escaped for JSX).
 * @param {string} p
 * @returns {string}
 */
export function normalizeFsPathForJsx(p) {
    if (!p || typeof p !== 'string') return '';
    let s = p.trim();

    // Handle file:// URI
    if (/^file:\/\//i.test(s)) {
        try {
            const u = new URL(s);
            if (u.host) {
                // UNC path: file://server/share/path -> //server/share/path
                const unc = `//${u.host}${decodeURIComponent(u.pathname)}`;
                s = unc;
            } else {
                // Local drive: file:///C:/path -> C:/path
                s = decodeURIComponent(u.pathname);
                // Remove leading slash before drive letter if present
                s = s.replace(/^\/(.:\/)/, '$1');
            }
        } catch (_) {
            // Fall through to generic normalization
        }
    }

    // Handle extended-length/UNC prefixes like \\?\ or \\?\UNC\
    if (/^\\\\\?\\/i.test(s)) {
        // \\?\UNC\server\share -> \\server\share
        s = s.replace(/^\\\\\?\\UNC\\/i, '\\\\');
        s = s.replace(/^\\\\\?\\/i, '');
    }

    // UNC: \\server\share -> //server/share
    if (/^\\\\/.test(s)) {
        s = s.replace(/^\\\\/, '//');
    }

    // Convert remaining backslashes to forward slashes
    s = s.replace(/\\/g, '/');
    return s;
}

/**
 * Convenience helper to escape a filesystem path for embedding in JSX string literals.
 * @param {string} p
 * @returns {string}
 */
export function escapeFilePathForJsx(p) {
    return escapeJsxString(normalizeFsPathForJsx(p));
}
