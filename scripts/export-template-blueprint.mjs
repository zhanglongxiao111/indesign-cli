import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { AdvancedTemplateHandlers } from '../src/handlers/advancedTemplateHandlers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function formatSize(bounds) {
    if (!bounds || typeof bounds.width !== 'number' || typeof bounds.height !== 'number') {
        return '-';
    }
    const w = bounds.width.toFixed(2);
    const h = bounds.height.toFixed(2);
    return `${w}mm × ${h}mm`;
}

function flattenMetadata(metadata) {
    if (!metadata) return '';
    const pairs = Object.keys(metadata).map((key) => `${key}=${metadata[key]}`);
    return pairs.join(' | ');
}

async function main() {
    const response = await AdvancedTemplateHandlers.inspectTemplate({});
    if (!response || !response.success) {
        throw new Error(response?.result || '模板信息读取失败');
    }
    const data = response.result;
    const lines = [];
    const now = new Date();

    lines.push('# 模板槽位检查概览');
    lines.push('');
    lines.push(`- 导出时间：${now.toISOString()}`);
    lines.push(`- 文档名称：${data.documentName}`);
    lines.push(`- 模板路径：${data.templateFsPath}`);
    lines.push(`- 页面数量：${data.pageCount}`);
    lines.push('');

    lines.push('## 页面槽位');
    let pageHasSlots = false;
    for (const page of data.pages || []) {
        if (!page.slots || !page.slots.length) {
            continue;
        }
        pageHasSlots = true;
        lines.push(`### 页面 ${page.pageName ?? page.pageIndex}`);
        if (page.notes) {
            lines.push(`> 说明：${page.notes.replace(/\n/g, ' / ')}`);
        }
        for (const slot of page.slots) {
            lines.push(`- **${slot.slotName}** (${slot.declaredType || '未标类型'})`);
            lines.push(`  - 图层：${slot.layer || '-'}`);
            if (slot.description) {
                lines.push(`  - 描述：${slot.description}`);
            }
            const meta = flattenMetadata(slot.metadata);
            if (meta) {
                lines.push(`  - 额外标记：${meta}`);
            }
            lines.push(`  - 区域：${formatSize(slot.boundsMillimeters)}`);
            if (slot.textPreview) {
                const preview = slot.textPreview.replace(/\s+/g, ' ').slice(0, 80);
                lines.push(`  - 预览文本：${preview}`);
            }
        }
        lines.push('');
    }
    if (!pageHasSlots) {
        lines.push('（页面上未发现带脚本标签的槽位，主要内容来自母版。）');
        lines.push('');
    }

    lines.push('## 母版槽位');
    for (const master of data.masters || []) {
        lines.push(`### 母版 ${master.masterName}`);
        if (!master.slots || !master.slots.length) {
            lines.push('- 未找到脚本标签槽位。');
            lines.push('');
            continue;
        }
        for (const slot of master.slots) {
            lines.push(`- **${slot.slotName}** (${slot.declaredType || '未标类型'})`);
            lines.push(`  - 图层：${slot.layer || '-'}`);
            if (slot.description) {
                lines.push(`  - 描述：${slot.description}`);
            }
            const meta = flattenMetadata(slot.metadata);
            if (meta) {
                lines.push(`  - 额外标记：${meta}`);
            }
            lines.push(`  - 区域：${formatSize(slot.boundsMillimeters)}`);
            if (slot.textPreview) {
                const preview = slot.textPreview.replace(/\s+/g, ' ').slice(0, 80);
                lines.push(`  - 预览文本：${preview}`);
            }
            lines.push('');
        }
    }

    if (data.slotSummary && data.slotSummary.length) {
        lines.push('## 槽位汇总');
        lines.push('| 槽位 | 类型 | 出现次数 | 所在页面/母版 |');
        lines.push('| --- | --- | --- | --- |');
        for (const summary of data.slotSummary) {
            const locations = (summary.contexts || []).map((ctx) => {
                if (ctx.contextType === 'page') {
                    return `页面${ctx.pageName ?? ctx.pageIndex}`;
                }
                if (ctx.contextType === 'master') {
                    return `母版${ctx.masterName ?? ctx.masterIndex}`;
                }
                return ctx.contextType || '未知';
            }).join('、');
            lines.push(`| ${summary.slotName} | ${summary.declaredType || '-'} | ${summary.occurrences} | ${locations || '-'} |`);
        }
        lines.push('');
    }

    const outputPath = path.resolve(__dirname, '..', 'docs', 'template-blueprint.md');
    fs.writeFileSync(outputPath, lines.join('\n'), { encoding: 'utf8' });
    console.log(`Markdown exported to ${outputPath}`);
}

main().catch((error) => {
    console.error('导出失败：', error);
    process.exit(1);
});
