import { tools as creationTools } from './creation.js';
import { tools as membershipTools } from './membership.js';
import { tools as inspectionTools } from './inspection.js';
import { tools as propertyTools } from './properties.js';

const toolsByName = new Map([
    ...creationTools,
    ...membershipTools,
    ...inspectionTools,
    ...propertyTools
].map((tool) => [tool.name, tool]));

export const tools = [
    'add_item_to_group',
    'create_group',
    'create_group_from_items',
    'get_group_info',
    'list_groups',
    'remove_item_from_group',
    'set_group_properties',
    'ungroup'
].map((name) => toolsByName.get(name));
