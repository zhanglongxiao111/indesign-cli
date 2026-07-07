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
    'adjust_page_layout',
    'create_page_guides',
    'delete_all_page_layout_snapshots',
    'delete_page',
    'delete_page_layout_snapshot',
    'duplicate_page',
    'get_page_content_summary',
    'get_page_info',
    'move_page',
    'navigate_to_page',
    'place_file_on_page',
    'place_xml_on_page',
    'reframe_page',
    'resize_page',
    'select_page',
    'set_page_background',
    'set_page_properties',
    'snapshot_page_layout'
].map((name) => toolsByName.get(name));
