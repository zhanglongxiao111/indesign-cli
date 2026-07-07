import { tools as lifecycleTools } from './lifecycle.js';
import { tools as navigationTools } from './navigation.js';
import { tools as inspectionTools } from './inspection.js';
import { tools as layoutTools } from './layout.js';
import { tools as placementTools } from './placement.js';
import { tools as snapshotTools } from './snapshots.js';
import { tools as backgroundTools } from './background.js';

const toolsByName = new Map([
    ...lifecycleTools,
    ...navigationTools,
    ...inspectionTools,
    ...layoutTools,
    ...placementTools,
    ...snapshotTools,
    ...backgroundTools
].map((tool) => [tool.name, tool]));

export const tools = [
    'add_page',
    'delete_page',
    'duplicate_page',
    'navigate_to_page',
    'get_page_info',
    'move_page',
    'set_page_properties',
    'adjust_page_layout',
    'resize_page',
    'place_file_on_page',
    'place_xml_on_page',
    'snapshot_page_layout',
    'delete_page_layout_snapshot',
    'delete_all_page_layout_snapshots',
    'reframe_page',
    'create_page_guides',
    'select_page',
    'get_page_content_summary',
    'set_page_background'
].map((name) => toolsByName.get(name));
