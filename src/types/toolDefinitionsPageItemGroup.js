/**
 * PageItem and Group tool definitions
 */
export const pageItemGroupToolDefinitions = [
    // PageItem Management Tools
    {
        name: 'get_page_item_info',
        description: 'Get detailed information about a specific page item',
        inputSchema: {
            type: 'object',
            properties: {
                pageIndex: {
                    type: 'integer',
                    description: 'Index of the page containing the item'
                },
                itemIndex: {
                    type: 'integer',
                    description: 'Index of the page item to get info for'
                }
            },
            required: ['pageIndex', 'itemIndex']
        }
    },
    {
        name: 'select_page_item',
        description: 'Select a specific page item',
        inputSchema: {
            type: 'object',
            properties: {
                pageIndex: {
                    type: 'integer',
                    description: 'Index of the page containing the item'
                },
                itemIndex: {
                    type: 'integer',
                    description: 'Index of the page item to select'
                },
                existingSelection: {
                    type: 'string',
                    enum: ['REPLACE_WITH', 'ADD_TO', 'REMOVE_FROM'],
                    description: 'How to handle existing selection',
                    default: 'REPLACE_WITH'
                }
            },
            required: ['pageIndex', 'itemIndex']
        }
    },
    {
        name: 'move_page_item',
        description: 'Move a page item to a new position',
        inputSchema: {
            type: 'object',
            properties: {
                pageIndex: {
                    type: 'integer',
                    description: 'Index of the page containing the item'
                },
                itemIndex: {
                    type: 'integer',
                    description: 'Index of the page item to move'
                },
                x: {
                    type: 'number',
                    description: 'New X coordinate'
                },
                y: {
                    type: 'number',
                    description: 'New Y coordinate'
                }
            },
            required: ['pageIndex', 'itemIndex', 'x', 'y']
        }
    },
    {
        name: 'resize_page_item',
        description: 'Resize a page item',
        inputSchema: {
            type: 'object',
            properties: {
                pageIndex: {
                    type: 'integer',
                    description: 'Index of the page containing the item'
                },
                itemIndex: {
                    type: 'integer',
                    description: 'Index of the page item to resize'
                },
                width: {
                    type: 'number',
                    description: 'New width'
                },
                height: {
                    type: 'number',
                    description: 'New height'
                },
                anchorPoint: {
                    type: 'string',
                    enum: ['CENTER_ANCHOR', 'TOP_LEFT_ANCHOR', 'TOP_CENTER_ANCHOR', 'TOP_RIGHT_ANCHOR', 'LEFT_CENTER_ANCHOR', 'RIGHT_CENTER_ANCHOR', 'BOTTOM_LEFT_ANCHOR', 'BOTTOM_CENTER_ANCHOR', 'BOTTOM_RIGHT_ANCHOR'],
                    description: 'Anchor point for resizing',
                    default: 'CENTER_ANCHOR'
                }
            },
            required: ['pageIndex', 'itemIndex', 'width', 'height']
        }
    },
    {
        name: 'set_page_item_properties',
        description: 'Set properties of a page item',
        inputSchema: {
            type: 'object',
            properties: {
                pageIndex: {
                    type: 'integer',
                    description: 'Index of the page containing the item'
                },
                itemIndex: {
                    type: 'integer',
                    description: 'Index of the page item to modify'
                },
                fillColor: {
                    type: 'string',
                    description: 'Fill color name'
                },
                strokeColor: {
                    type: 'string',
                    description: 'Stroke color name'
                },
                strokeWeight: {
                    type: 'number',
                    description: 'Stroke weight'
                },
                visible: {
                    type: 'boolean',
                    description: 'Whether the item is visible'
                },
                locked: {
                    type: 'boolean',
                    description: 'Whether the item is locked'
                }
            },
            required: ['pageIndex', 'itemIndex']
        }
    },
    {
        name: 'duplicate_page_item',
        description: 'Duplicate a page item',
        inputSchema: {
            type: 'object',
            properties: {
                pageIndex: {
                    type: 'integer',
                    description: 'Index of the page containing the item'
                },
                itemIndex: {
                    type: 'integer',
                    description: 'Index of the page item to duplicate'
                },
                x: {
                    type: 'number',
                    description: 'X coordinate for the duplicate'
                },
                y: {
                    type: 'number',
                    description: 'Y coordinate for the duplicate'
                }
            },
            required: ['pageIndex', 'itemIndex', 'x', 'y']
        }
    },
    {
        name: 'delete_page_item',
        description: 'Delete a page item',
        inputSchema: {
            type: 'object',
            properties: {
                pageIndex: {
                    type: 'integer',
                    description: 'Index of the page containing the item'
                },
                itemIndex: {
                    type: 'integer',
                    description: 'Index of the page item to delete'
                }
            },
            required: ['pageIndex', 'itemIndex']
        }
    },
    {
        name: 'get_page_item_script_labels',
        description: 'Read script labels from page items using selection or explicit identifiers',
        inputSchema: {
            type: 'object',
            properties: {
                mode: {
                    type: 'string',
                    enum: ['CURRENT_SELECTION', 'PAGE_ITEM', 'PAGE_NUMBER_AND_OBJECT_ID', 'ALL_WITH_LABELS'],
                    description: 'Selection mode: current selection, page/item indices, page number and object id, or sweep all labelled items',
                    default: 'CURRENT_SELECTION'
                },
                pageIndex: {
                    type: 'integer',
                    description: 'When mode=PAGE_ITEM, index of the page containing the item (zero-based)'
                },
                itemIndex: {
                    type: 'integer',
                    description: 'When mode=PAGE_ITEM, index of the page item (zero-based)'
                },
                pageNumber: {
                    type: 'integer',
                    description: 'When mode=PAGE_NUMBER_AND_OBJECT_ID, page number using documentOffset+1'
                },
                objectId: {
                    type: 'integer',
                    description: 'When mode=PAGE_NUMBER_AND_OBJECT_ID, InDesign object id of the page item'
                }
            },
            additionalProperties: false
        }
    },
    {
        name: 'set_page_item_script_label',
        description: 'Overwrite the script label for targeted page items',
        inputSchema: {
            type: 'object',
            properties: {
                mode: {
                    type: 'string',
                    enum: ['CURRENT_SELECTION', 'PAGE_ITEM', 'PAGE_NUMBER_AND_OBJECT_ID'],
                    description: 'Selection mode: current selection, page/item indices, or page number plus object id',
                    default: 'CURRENT_SELECTION'
                },
                pageIndex: {
                    type: 'integer',
                    description: 'When mode=PAGE_ITEM, index of the page containing the item (zero-based)'
                },
                itemIndex: {
                    type: 'integer',
                    description: 'When mode=PAGE_ITEM, index of the page item (zero-based)'
                },
                pageNumber: {
                    type: 'integer',
                    description: 'When mode=PAGE_NUMBER_AND_OBJECT_ID, page number using documentOffset+1'
                },
                objectId: {
                    type: 'integer',
                    description: 'When mode=PAGE_NUMBER_AND_OBJECT_ID, InDesign object id of the page item'
                },
                label: {
                    type: 'string',
                    description: 'Script label to assign; use empty string to clear',
                    default: ''
                }
            },
            required: ['label'],
            additionalProperties: false
        }
    },
    {
        name: 'list_page_items',
        description: 'List all page items on a specific page',
        inputSchema: {
            type: 'object',
            properties: {
                pageIndex: {
                    type: 'integer',
                    description: 'Index of the page to list items from'
                }
            },
            required: ['pageIndex'],
            additionalProperties: false
        }
    },

    // Group Management Tools
    {
        name: 'create_group',
        description: 'Create a group from currently selected items',
        inputSchema: {
            type: 'object',
            properties: {
                pageIndex: {
                    type: 'integer',
                    description: 'Index of the page where the group will be created'
                }
            },
            required: ['pageIndex'],
            additionalProperties: false
        }
    },
    {
        name: 'create_group_from_items',
        description: 'Create a group from specific page items by their indices',
        inputSchema: {
            type: 'object',
            properties: {
                pageIndex: {
                    type: 'integer',
                    description: 'Index of the page containing the items'
                },
                itemIndices: {
                    type: 'array',
                    items: {
                        type: 'integer'
                    },
                    description: 'Array of item indices to group together',
                    minItems: 2
                }
            },
            required: ['pageIndex', 'itemIndices']
        }
    },
    {
        name: 'ungroup',
        description: 'Ungroup a group, releasing all its items',
        inputSchema: {
            type: 'object',
            properties: {
                pageIndex: {
                    type: 'integer',
                    description: 'Index of the page containing the group'
                },
                groupIndex: {
                    type: 'integer',
                    description: 'Index of the group to ungroup'
                }
            },
            required: ['pageIndex', 'groupIndex']
        }
    },
    {
        name: 'get_group_info',
        description: 'Get detailed information about a group',
        inputSchema: {
            type: 'object',
            properties: {
                pageIndex: {
                    type: 'integer',
                    description: 'Index of the page containing the group'
                },
                groupIndex: {
                    type: 'integer',
                    description: 'Index of the group to get info for'
                }
            },
            required: ['pageIndex', 'groupIndex']
        }
    },
    {
        name: 'add_item_to_group',
        description: 'Add a page item to an existing group',
        inputSchema: {
            type: 'object',
            properties: {
                pageIndex: {
                    type: 'integer',
                    description: 'Index of the page containing the group and item'
                },
                groupIndex: {
                    type: 'integer',
                    description: 'Index of the group to add the item to'
                },
                itemIndex: {
                    type: 'integer',
                    description: 'Index of the page item to add to the group'
                }
            },
            required: ['pageIndex', 'groupIndex', 'itemIndex']
        }
    },
    {
        name: 'remove_item_from_group',
        description: 'Remove a page item from a group',
        inputSchema: {
            type: 'object',
            properties: {
                pageIndex: {
                    type: 'integer',
                    description: 'Index of the page containing the group'
                },
                groupIndex: {
                    type: 'integer',
                    description: 'Index of the group to remove the item from'
                },
                itemIndex: {
                    type: 'integer',
                    description: 'Index of the item within the group to remove'
                }
            },
            required: ['pageIndex', 'groupIndex', 'itemIndex']
        }
    },
    {
        name: 'list_groups',
        description: 'List all groups on a specific page',
        inputSchema: {
            type: 'object',
            properties: {
                pageIndex: {
                    type: 'integer',
                    description: 'Index of the page to list groups from'
                }
            },
            required: ['pageIndex'],
            additionalProperties: false
        }
    },
    {
        name: 'set_group_properties',
        description: 'Set properties of a group',
        inputSchema: {
            type: 'object',
            properties: {
                pageIndex: {
                    type: 'integer',
                    description: 'Index of the page containing the group'
                },
                groupIndex: {
                    type: 'integer',
                    description: 'Index of the group to modify'
                },
                visible: {
                    type: 'boolean',
                    description: 'Whether the group is visible'
                },
                locked: {
                    type: 'boolean',
                    description: 'Whether the group is locked'
                },
                name: {
                    type: 'string',
                    description: 'Name for the group'
                }
            },
            required: ['pageIndex', 'groupIndex']
        }
    }
]; 
