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

export function looksLikeFailureText(value) {
    if (typeof value !== 'string') return false;
    return /^(Error|Failed|ERROR)\b/.test(value.trim());
}

/**
 * Formats a response with a consistent structure.
 * @param {any} result - The result to format.
 * @param {string} [operation="Operation"] - The operation name.
 * @returns {object} Formatted response object.
 */
export function formatScriptResult(result, operation = "Operation") {
    const timestamp = new Date().toISOString();
    let parsed = result;
    if (typeof result === 'string') {
        try {
            parsed = JSON.parse(result);
        } catch (_) {
            parsed = result;
        }
    }

    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        if (parsed.success === false || parsed.ok === false) {
            const message = parsed.message ?? parsed.error ?? parsed.result ?? result;
            return {
                success: false,
                operation: parsed.operation || operation,
                code: parsed.code || parsed.errorCode || 'INDESIGN_SCRIPT_FAILED',
                message,
                error: parsed.error,
                step: parsed.step,
                errorName: parsed.errorName,
                errorNumber: parsed.errorNumber,
                line: parsed.line,
                fileName: parsed.fileName,
                result: parsed.result ?? parsed.error ?? parsed.message ?? result,
                data: parsed.data,
                documentState: parsed.documentState,
                timestamp: parsed.timestamp || timestamp
            };
        }
        if (parsed.success === true || parsed.ok === true) {
            const failureText = [parsed.message, parsed.result, parsed.error]
                .find((value) => looksLikeFailureText(value));
            if (failureText) {
                return {
                    ...parsed,
                    success: false,
                    operation: parsed.operation || operation,
                    code: parsed.code || parsed.errorCode || 'INDESIGN_SCRIPT_FAILED',
                    result: parsed.result ?? parsed.error ?? parsed.message ?? result,
                    timestamp: parsed.timestamp || timestamp
                };
            }
            return {
                ...parsed,
                success: parsed.success !== undefined ? parsed.success : true,
                operation: parsed.operation || operation,
                timestamp: parsed.timestamp || timestamp
            };
        }
        return {
            success: true,
            operation,
            result: parsed,
            timestamp
        };
    }

    const text = String(result ?? '');
    if (text.includes('No document open')) {
        return {
            success: false,
            operation,
            code: 'NO_ACTIVE_DOCUMENT',
            result: text,
            timestamp
        };
    }
    if (text.includes('No document to close')) {
        return {
            success: false,
            operation,
            code: 'NO_ACTIVE_DOCUMENT',
            result: text,
            timestamp
        };
    }
    if (looksLikeFailureText(text)) {
        return {
            success: false,
            operation,
            code: 'INDESIGN_SCRIPT_FAILED',
            result: text,
            timestamp
        };
    }
    return {
        success: true,
        operation,
        result: text,
        timestamp
    };
}

export function formatResponse(result, operation = "Operation") {
    return formatScriptResult(result, operation);
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
