#!/usr/bin/env node

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { registry } from '../tools/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ARTIFACT_PATH = path.join(__dirname, 'indesign-tool-registry.json');
const SCHEMA_VERSION = 1;

function sourceForProfiles(profiles) {
    if (profiles.includes('classic')) return 'classic';
    if (profiles.includes('advanced')) return 'advanced';
    return 'hidden_handler';
}

function stableStringify(value) {
    if (Array.isArray(value)) {
        return `[${value.map((item) => stableStringify(item)).join(',')}]`;
    }
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

function artifactPayload() {
    const groups = {};
    for (const tool of registry.tools) {
        const source = sourceForProfiles(tool.profiles);
        if (!groups[source]) {
            groups[source] = [];
        }
        groups[source].push({
            name: tool.name,
            source,
            domain: tool.cli.domain,
            cli: {
                id: tool.cli.id,
                domain: tool.cli.domain,
                aliases: tool.cli.aliases || []
            },
            contract: tool.contract,
            inputSchema: tool.inputSchema
        });
    }

    for (const source of Object.keys(groups)) {
        groups[source].sort((a, b) => a.name.localeCompare(b.name));
    }

    const hashInput = {
        schema_version: SCHEMA_VERSION,
        tool_count: registry.tools.length,
        sources: groups
    };

    return {
        schema_version: SCHEMA_VERSION,
        generated_at: new Date().toISOString(),
        registry_hash: crypto.createHash('sha256').update(stableStringify(hashInput)).digest('hex'),
        tool_count: registry.tools.length,
        sources: groups
    };
}

function comparableArtifact(artifact) {
    return {
        schema_version: artifact.schema_version,
        registry_hash: artifact.registry_hash,
        tool_count: artifact.tool_count,
        sources: artifact.sources
    };
}

function readExistingArtifact() {
    if (!fs.existsSync(ARTIFACT_PATH)) {
        return null;
    }
    return JSON.parse(fs.readFileSync(ARTIFACT_PATH, 'utf8'));
}

function withPreservedGeneratedAtIfUnchanged(artifact) {
    const existing = readExistingArtifact();
    if (!existing) {
        return artifact;
    }
    if (stableStringify(comparableArtifact(artifact)) !== stableStringify(comparableArtifact(existing))) {
        return artifact;
    }
    return {
        ...artifact,
        generated_at: existing.generated_at
    };
}

export function generateArtifact() {
    return withPreservedGeneratedAtIfUnchanged(artifactPayload());
}

export function writeArtifact() {
    const artifact = generateArtifact();
    const nextContent = `${JSON.stringify(artifact, null, 2)}\n`;
    const existingContent = fs.existsSync(ARTIFACT_PATH) ? fs.readFileSync(ARTIFACT_PATH, 'utf8') : null;
    if (existingContent !== nextContent) {
        fs.writeFileSync(ARTIFACT_PATH, nextContent, 'utf8');
    }
    return artifact;
}

export function checkArtifact() {
    if (!fs.existsSync(ARTIFACT_PATH)) {
        throw new Error(`Artifact missing: ${ARTIFACT_PATH}`);
    }
    const current = comparableArtifact(generateArtifact());
    const existing = comparableArtifact(readExistingArtifact());
    if (stableStringify(current) !== stableStringify(existing)) {
        throw new Error('Artifact is out of date. Run: node src/core/artifact.js --write');
    }
    return true;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
    try {
        if (process.argv.includes('--write')) {
            writeArtifact();
            console.error(`Wrote ${ARTIFACT_PATH}`);
        } else if (process.argv.includes('--check')) {
            checkArtifact();
            console.error('Artifact check passed');
        } else {
            console.error('Usage: node src/core/artifact.js --write|--check');
            process.exitCode = 1;
        }
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}
