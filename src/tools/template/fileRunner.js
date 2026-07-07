import fs from 'fs';
import path from 'path';
import {
    defineTemplateTool,
    formatErrorResponse,
    formatResponse,
    runScriptFile,
    templateContract
} from './_shared.js';
import { runJsxFileSchema } from './schemas.js';

export async function runJsxFile(args) {
    const { filePath } = args || {};
    if (!filePath || typeof filePath !== 'string' || !filePath.trim()) {
        return formatErrorResponse('filePath 必须是 JSX 文件的有效路径。', 'Run JSX File');
    }

    const resolvedPath = path.resolve(filePath);
    const ext = path.extname(resolvedPath).toLowerCase();
    if (ext && ext !== '.jsx') {
        return formatErrorResponse('filePath 需要指向 .jsx 文件。', 'Run JSX File');
    }

    try {
        const stats = fs.statSync(resolvedPath);
        if (!stats.isFile()) {
            return formatErrorResponse(`指定路径不是文件：${resolvedPath}`, 'Run JSX File');
        }
        if (stats.size === 0) {
            return formatErrorResponse('JSX 文件为空，无法执行。', 'Run JSX File');
        }
    } catch (error) {
        return formatErrorResponse(`无法访问 JSX 文件：${error.message}`, 'Run JSX File');
    }

    try {
        const result = await runScriptFile(resolvedPath);
        if (typeof result === 'string' && result.trim().startsWith('Error:')) {
            return formatErrorResponse(result, 'Run JSX File');
        }
        return formatResponse(result, 'Run JSX File');
    } catch (error) {
        return formatErrorResponse(error.message, 'Run JSX File');
    }
}

export const runJsxFileTool = defineTemplateTool({
    name: 'run_jsx_file',
    description: '执行本地 .jsx 脚本文件，返回执行结果或错误信息。',
    contract: templateContract({ mutatesDocument: true }),
    inputSchema: runJsxFileSchema,
    handler: runJsxFile
});

export const tools = [runJsxFileTool];
