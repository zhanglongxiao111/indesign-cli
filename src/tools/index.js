import { buildRegistry } from './_contract.js';
import { tools as documentTools } from './document/index.js';
import { tools as pageTools } from './page/index.js';
import { tools as textTools } from './text/index.js';
import { tools as styleTools } from './style/index.js';
import { tools as graphicsTools } from './graphics/index.js';
import { tools as masterSpreadTools } from './masterSpread/index.js';
import { tools as spreadTools } from './spread/index.js';
import { tools as pageItemTools } from './pageItem/index.js';
import { tools as groupTools } from './group/index.js';
import { tools as bookTools } from './book/index.js';
import { tools as presentationTools } from './presentation/index.js';
import { tools as exportTools } from './export/index.js';
import { tools as utilityTools } from './utility/index.js';
import { createTools as createHelpTools } from './help/index.js';
import { tools as layerTools } from './layer/index.js';
import { tools as templateTools } from './template/index.js';

const helpTools = createHelpTools({ getRegistry: () => registry });

export const registry = buildRegistry([
    { domain: 'layer', tools: layerTools },
    { domain: 'document', tools: documentTools },
    { domain: 'page', tools: pageTools },
    { domain: 'text', tools: textTools },
    { domain: 'style', tools: styleTools },
    { domain: 'graphics', tools: graphicsTools },
    { domain: 'masterSpread', tools: masterSpreadTools },
    { domain: 'spread', tools: spreadTools },
    { domain: 'pageItem', tools: pageItemTools },
    { domain: 'group', tools: groupTools },
    { domain: 'book', tools: bookTools },
    { domain: 'presentation', tools: presentationTools },
    { domain: 'export', tools: exportTools },
    { domain: 'utility', tools: utilityTools },
    { domain: 'help', tools: helpTools },
    { domain: 'template', tools: templateTools }
]);

export const tools = registry.tools;
