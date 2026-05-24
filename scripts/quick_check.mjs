import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const typesUrl = pathToFileURL(path.join(__dirname, '..', 'src', 'types', 'index.js')).href;
const { allToolDefinitions } = await import(typesUrl);
console.log('Tool count:', allToolDefinitions.length);
