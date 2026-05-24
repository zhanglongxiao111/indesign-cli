/**
 * Enhanced Session management for InDesign MCP Server
 * Stores page dimensions and other session-specific data with improved validation and error handling
 */
if (typeof globalThis.CustomEvent !== 'function') {
    const BaseEvent = typeof globalThis.Event === 'function' ? globalThis.Event : null;
    if (BaseEvent) {
        class NodeCustomEvent extends BaseEvent {
            constructor(type, params = {}) {
                super(type, params);
                this.detail = params?.detail ?? null;
            }
        }
        globalThis.CustomEvent = NodeCustomEvent;
    } else {
        class MinimalCustomEvent {
            constructor(type, params = {}) {
                this.type = type;
                this.detail = params?.detail ?? null;
                this.bubbles = Boolean(params?.bubbles);
                this.cancelable = Boolean(params?.cancelable);
            }
        }
        globalThis.CustomEvent = MinimalCustomEvent;
    }
}

export class SessionManager extends EventTarget {
    constructor(config = {}) {
        super();

        this.config = {
            defaultMargin: config.defaultMargin || 20,
            minMargin: config.minMargin || 5,
            minDimension: config.minDimension || 10,
            maxDimension: config.maxDimension || 10000,
            precision: config.precision || 2,
            ...config
        };

        this.sessionData = {
            pageDimensions: null,
            activeDocument: null,
            activePage: null,
            lastCreatedItem: null,
            createdAt: new Date().toISOString(),
            lastModified: null
        };
    }

    /**
     * Set page dimensions for the current session
     * @param {Object} dimensions - Page dimensions object
     * @param {number} dimensions.width - Page width in mm
     * @param {number} dimensions.height - Page height in mm
     */
    setPageDimensions(dimensions) {
        this._validateDimensions(dimensions);

        const old = this.sessionData.pageDimensions;
        this.sessionData.pageDimensions = { ...dimensions };
        this._updateLastModified();

        this.dispatchEvent(new CustomEvent('dimensionsChanged', {
            detail: { old, new: dimensions }
        }));
    }

    /**
     * Get page dimensions for the current session (returns copy to prevent mutations)
     */
    getPageDimensions() {
        return this.sessionData.pageDimensions ? { ...this.sessionData.pageDimensions } : null;
    }

    /**
     * Set active document info
     */
    setActiveDocument(documentInfo) {
        this._validateDocumentInfo(documentInfo);

        const old = this.sessionData.activeDocument;
        this.sessionData.activeDocument = documentInfo ? { ...documentInfo } : null;
        this._updateLastModified();

        this.dispatchEvent(new CustomEvent('documentChanged', {
            detail: { old, new: documentInfo }
        }));
    }

    /**
     * Get active document info (returns copy)
     */
    getActiveDocument() {
        return this.sessionData.activeDocument ? { ...this.sessionData.activeDocument } : null;
    }

    /**
     * Set active page info
     */
    setActivePage(pageInfo) {
        this._validatePageInfo(pageInfo);

        const old = this.sessionData.activePage;
        this.sessionData.activePage = pageInfo ? { ...pageInfo } : null;
        this._updateLastModified();

        this.dispatchEvent(new CustomEvent('pageChanged', {
            detail: { old, new: pageInfo }
        }));
    }

    /**
     * Get active page info (returns copy)
     */
    getActivePage() {
        return this.sessionData.activePage ? { ...this.sessionData.activePage } : null;
    }

    /**
     * Set last created item info
     */
    setLastCreatedItem(itemInfo) {
        this.sessionData.lastCreatedItem = itemInfo ? { ...itemInfo, createdAt: new Date().toISOString() } : null;
        this._updateLastModified();
    }

    /**
     * Get last created item info (returns copy)
     */
    getLastCreatedItem() {
        return this.sessionData.lastCreatedItem ? { ...this.sessionData.lastCreatedItem } : null;
    }

    /**
     * Get calculated positioning based on page dimensions with enhanced bounds checking
     */
    getCalculatedPositioning(options = {}) {
        const dimensions = this.getPageDimensions();
        if (!dimensions) {
            return this._getDefaultPositioning(options);
        }

        const config = this._getPositioningConfig(options);
        const bounds = this._calculateBounds(dimensions, config);
        const position = this._adjustPositionToBounds(options, bounds, config);

        return this._roundPositioning(position, bounds);
    }

    /**
     * Enhanced validation with detailed feedback
     */
    validatePositioning(x, y, width, height) {
        // Input validation
        const inputValidation = this._validatePositioningInputs(x, y, width, height);
        if (!inputValidation.valid) return inputValidation;

        const dimensions = this.getPageDimensions();
        if (!dimensions) {
            return {
                valid: true,
                reason: 'No page dimensions available for validation',
                warning: 'Consider setting page dimensions for better validation'
            };
        }

        return this._validateAgainstPageBounds(x, y, width, height, dimensions);
    }

    /**
     * Get available space at given position
     */
    getAvailableSpace(x, y) {
        const bounds = this.getPageBounds();
        if (!bounds) return null;

        return {
            width: Math.max(0, bounds.pageWidth - x - bounds.minMargin),
            height: Math.max(0, bounds.pageHeight - y - bounds.minMargin),
            maxWidth: bounds.pageWidth - bounds.minMargin * 2,
            maxHeight: bounds.pageHeight - bounds.minMargin * 2
        };
    }

    /**
     * Find optimal position for given dimensions
     */
    findOptimalPosition(width, height, preferences = {}) {
        const bounds = this.getPageBounds();
        if (!bounds) return null;

        const { align = 'top-left', margin = this.config.defaultMargin } = preferences;

        const positions = {
            'top-left': { x: margin, y: margin },
            'top-center': { x: (bounds.pageWidth - width) / 2, y: margin },
            'top-right': { x: bounds.pageWidth - width - margin, y: margin },
            'center-left': { x: margin, y: (bounds.pageHeight - height) / 2 },
            'center': { x: (bounds.pageWidth - width) / 2, y: (bounds.pageHeight - height) / 2 },
            'center-right': { x: bounds.pageWidth - width - margin, y: (bounds.pageHeight - height) / 2 },
            'bottom-left': { x: margin, y: bounds.pageHeight - height - margin },
            'bottom-center': { x: (bounds.pageWidth - width) / 2, y: bounds.pageHeight - height - margin },
            'bottom-right': { x: bounds.pageWidth - width - margin, y: bounds.pageHeight - height - margin }
        };

        const position = positions[align] || positions['top-left'];
        const validation = this.validatePositioning(position.x, position.y, width, height);

        return {
            ...position,
            validation,
            align
        };
    }

    /**
     * Get enhanced page bounds information
     */
    getPageBounds() {
        const dimensions = this.getPageDimensions();
        if (!dimensions) return null;

        const { width: pageWidth, height: pageHeight } = dimensions;
        const margin = this.config.defaultMargin;
        const minMargin = this.config.minMargin;

        return {
            pageWidth,
            pageHeight,
            margin,
            minMargin,
            safeArea: {
                x: margin,
                y: margin,
                width: Math.max(0, pageWidth - (margin * 2)),
                height: Math.max(0, pageHeight - (margin * 2))
            },
            absoluteBounds: {
                x: minMargin,
                y: minMargin,
                width: Math.max(0, pageWidth - (minMargin * 2)),
                height: Math.max(0, pageHeight - (minMargin * 2))
            },
            center: {
                x: pageWidth / 2,
                y: pageHeight / 2
            }
        };
    }

    /**
     * Clear session data with optional preservation
     */
    clearSession(preserve = []) {
        const preserveSet = new Set(preserve);
        const oldData = { ...this.sessionData };

        this.sessionData = {
            pageDimensions: preserveSet.has('pageDimensions') ? this.sessionData.pageDimensions : null,
            activeDocument: preserveSet.has('activeDocument') ? this.sessionData.activeDocument : null,
            activePage: preserveSet.has('activePage') ? this.sessionData.activePage : null,
            lastCreatedItem: preserveSet.has('lastCreatedItem') ? this.sessionData.lastCreatedItem : null,
            createdAt: new Date().toISOString(),
            lastModified: null
        };

        this.dispatchEvent(new CustomEvent('sessionCleared', {
            detail: { old: oldData, preserved: preserve }
        }));
    }

    /**
     * Get comprehensive session summary
     */
    getSessionSummary() {
        const bounds = this.getPageBounds();

        return {
            hasPageDimensions: !!this.sessionData.pageDimensions,
            hasActiveDocument: !!this.sessionData.activeDocument,
            hasActivePage: !!this.sessionData.activePage,
            hasLastCreatedItem: !!this.sessionData.lastCreatedItem,
            pageDimensions: this.getPageDimensions(),
            activeDocument: this.getActiveDocument(),
            activePage: this.getActivePage(),
            lastCreatedItem: this.getLastCreatedItem(),
            bounds: bounds,
            timestamps: {
                createdAt: this.sessionData.createdAt,
                lastModified: this.sessionData.lastModified
            },
            config: { ...this.config }
        };
    }

    /**
     * Export session data for persistence
     */
    exportSession() {
        return JSON.stringify({
            sessionData: this.sessionData,
            config: this.config,
            version: '2.0'
        });
    }

    /**
     * Import session data from persistence
     */
    importSession(sessionString) {
        try {
            const imported = JSON.parse(sessionString);
            if (imported.version && imported.sessionData) {
                this.sessionData = { ...imported.sessionData };
                if (imported.config) {
                    this.config = { ...this.config, ...imported.config };
                }
                this.dispatchEvent(new CustomEvent('sessionImported', {
                    detail: { version: imported.version }
                }));
                return true;
            }
        } catch (error) {
            console.error('Failed to import session:', error);
        }
        return false;
    }

    // Private helper methods
    _validateDimensions(dimensions) {
        if (!dimensions || typeof dimensions !== 'object') {
            throw new Error('Dimensions must be an object');
        }

        const { width, height } = dimensions;
        if (typeof width !== 'number' || typeof height !== 'number') {
            throw new Error('Width and height must be numbers');
        }

        if (width <= 0 || height <= 0) {
            throw new Error('Width and height must be positive');
        }

        if (width > this.config.maxDimension || height > this.config.maxDimension) {
            throw new Error(`Dimensions exceed maximum allowed size of ${this.config.maxDimension}mm`);
        }
    }

    _validateDocumentInfo(documentInfo) {
        if (documentInfo && typeof documentInfo !== 'object') {
            throw new Error('Document info must be an object');
        }
    }

    _validatePageInfo(pageInfo) {
        if (pageInfo && typeof pageInfo !== 'object') {
            throw new Error('Page info must be an object');
        }
    }

    _validatePositioningInputs(x, y, width, height) {
        const inputs = { x, y, width, height };

        for (const [key, value] of Object.entries(inputs)) {
            if (typeof value !== 'number' || isNaN(value)) {
                return {
                    valid: false,
                    reason: `${key} must be a valid number`,
                    input: key
                };
            }
        }

        if (width <= 0 || height <= 0) {
            return {
                valid: false,
                reason: 'Width and height must be positive',
                suggested: {
                    width: Math.max(width, this.config.minDimension),
                    height: Math.max(height, this.config.minDimension)
                }
            };
        }

        return { valid: true };
    }

    _validateAgainstPageBounds(x, y, width, height, dimensions) {
        const { width: pageWidth, height: pageHeight } = dimensions;
        const minMargin = this.config.minMargin;

        if (x < minMargin) {
            return {
                valid: false,
                reason: `X position (${x}mm) is too close to left edge`,
                suggested: { x: minMargin },
                bounds: { minX: minMargin }
            };
        }

        if (y < minMargin) {
            return {
                valid: false,
                reason: `Y position (${y}mm) is too close to top edge`,
                suggested: { y: minMargin },
                bounds: { minY: minMargin }
            };
        }

        if (x + width > pageWidth - minMargin) {
            return {
                valid: false,
                reason: `Content extends beyond right edge (${x + width}mm > ${pageWidth - minMargin}mm)`,
                suggested: {
                    width: Math.max(pageWidth - x - minMargin, this.config.minDimension),
                    x: Math.max(pageWidth - width - minMargin, minMargin)
                },
                bounds: { maxX: pageWidth - minMargin }
            };
        }

        if (y + height > pageHeight - minMargin) {
            return {
                valid: false,
                reason: `Content extends beyond bottom edge (${y + height}mm > ${pageHeight - minMargin}mm)`,
                suggested: {
                    height: Math.max(pageHeight - y - minMargin, this.config.minDimension),
                    y: Math.max(pageHeight - height - minMargin, minMargin)
                },
                bounds: { maxY: pageHeight - minMargin }
            };
        }

        return {
            valid: true,
            reason: 'Positioning is within page bounds'
        };
    }

    _getDefaultPositioning(options) {
        return {
            x: options.x || 10,
            y: options.y || 10,
            width: options.width || 100,
            height: options.height || 50,
            note: 'No page dimensions available - using default positioning'
        };
    }

    _getPositioningConfig(options) {
        return {
            margin: options.margin ?? this.config.defaultMargin,
            minMargin: this.config.minMargin,
            minDimension: this.config.minDimension
        };
    }

    _calculateBounds(dimensions, config) {
        const { width: pageWidth, height: pageHeight } = dimensions;

        return {
            pageWidth,
            pageHeight,
            safeWidth: pageWidth - (config.margin * 2),
            safeHeight: pageHeight - (config.margin * 2),
            margin: config.margin,
            minMargin: config.minMargin
        };
    }

    _adjustPositionToBounds(options, bounds, config) {
        let x = options.x !== undefined ? options.x : bounds.margin;
        let y = options.y !== undefined ? options.y : bounds.margin;
        let width = options.width !== undefined ? options.width : Math.min(bounds.safeWidth, 100);
        let height = options.height !== undefined ? options.height : Math.min(bounds.safeHeight, 50);

        // Ensure content stays within page bounds
        if (x + width > bounds.pageWidth - config.minMargin) {
            if (options.x !== undefined) {
                width = Math.max(bounds.pageWidth - x - config.minMargin, config.minDimension);
            } else {
                x = Math.max(bounds.pageWidth - width - config.minMargin, bounds.margin);
            }
        }

        if (y + height > bounds.pageHeight - config.minMargin) {
            if (options.y !== undefined) {
                height = Math.max(bounds.pageHeight - y - config.minMargin, config.minDimension);
            } else {
                y = Math.max(bounds.pageHeight - height - config.minMargin, bounds.margin);
            }
        }

        // Ensure minimum dimensions and positions
        width = Math.max(width, config.minDimension);
        height = Math.max(height, config.minDimension);
        x = Math.max(x, config.minMargin);
        y = Math.max(y, config.minMargin);

        return { x, y, width, height };
    }

    _roundPositioning(position, bounds = null) {
        const precision = this.config.precision;
        const factor = Math.pow(10, precision);

        const result = {
            x: Math.round(position.x * factor) / factor,
            y: Math.round(position.y * factor) / factor,
            width: Math.round(position.width * factor) / factor,
            height: Math.round(position.height * factor) / factor
        };

        if (bounds) {
            result.pageWidth = bounds.pageWidth;
            result.pageHeight = bounds.pageHeight;
            result.safeArea = {
                width: bounds.safeWidth,
                height: bounds.safeHeight,
                margin: bounds.margin
            };
        }

        return result;
    }

    _updateLastModified() {
        this.sessionData.lastModified = new Date().toISOString();
    }

    // Alias for compatibility
    getSessionInfo() {
        return this.getSessionSummary();
    }
}

// Create a singleton instance with default configuration
export const sessionManager = new SessionManager({
    defaultMargin: 20,
    minMargin: 5,
    minDimension: 10,
    maxDimension: 10000,
    precision: 2
}); 
