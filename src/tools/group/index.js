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
    'create_group',
    'create_group_from_items',
    'ungroup',
    'get_group_info',
    'add_item_to_group',
    'remove_item_from_group',
    'list_groups',
    'set_group_properties'
].map((name) => toolsByName.get(name));
