#!/usr/bin/env python
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "agent-harness"))

from cli_anything.indesign.core.catalog import (  # noqa: E402
    Catalog,
    canonical_switch_only_entry,
)
from cli_anything.indesign.core.mcp_backend import McpBackend  # noqa: E402


GOLDEN_DIR = (
    REPO_ROOT
    / "docs"
    / "AI协作"
    / "本地Agent"
    / "进行中"
    / "2026-07-06_终态重构"
    / "golden"
)

SWITCH_ONLY_TOOLS: dict[str, dict[str, Any]] = {
    "preflight_document": {"domain": "document", "handler": "DocumentHandlers.preflightDocument"},
    "data_merge": {"domain": "document", "handler": "DocumentHandlers.dataMerge"},
    "get_document_xml_structure": {"domain": "document", "handler": "DocumentHandlers.getDocumentXmlStructure"},
    "export_document_xml": {"domain": "document", "handler": "DocumentHandlers.exportDocumentXml"},
    "save_document_to_cloud": {"domain": "document", "handler": "DocumentHandlers.saveDocumentToCloud"},
    "open_cloud_document": {"domain": "document", "handler": "DocumentHandlers.openCloudDocument"},
    "validate_document": {"domain": "document", "handler": "DocumentHandlers.validateDocument"},
    "cleanup_document": {"domain": "document", "handler": "DocumentHandlers.cleanupDocument"},
    "place_xml_on_spread": {"domain": "spread", "handler": "SpreadHandlers.placeXmlOnSpread"},
}


def build_current_node_catalog(timeout_seconds: int) -> list[dict[str, Any]]:
    classic_tools = McpBackend(REPO_ROOT, "src/index.js", timeout_seconds=timeout_seconds).list_tools()
    advanced_tools = McpBackend(REPO_ROOT, "src/advanced/index.js", timeout_seconds=timeout_seconds).list_tools()
    catalog = Catalog(repo_root=REPO_ROOT).with_exposed_tools(
        classic_tools=classic_tools,
        advanced_tools=advanced_tools,
        plugin_tools=[],
        plugin_domain_summaries={},
        plugin_records={},
    )
    entries = [
        tool
        for tool in catalog.list_tools(callable_only=False)
        if tool.get("source") in {"classic", "advanced", "hidden_handler"}
    ]
    existing_names = {tool["name"] for tool in entries}
    for name, info in SWITCH_ONLY_TOOLS.items():
        if name in existing_names:
            continue
        entries.append(
            canonical_switch_only_entry(
                domain=info["domain"],
                name=name,
                handler=info["handler"],
            )
        )
    return sorted(entries, key=lambda item: item["id"])


def assert_switch_cases_present() -> None:
    content = (REPO_ROOT / "src" / "core" / "InDesignMCPServer.js").read_text(encoding="utf-8")
    cases = set(re.findall(r"case\s+'([^']+)'\s*:", content))
    missing = sorted(set(SWITCH_ONLY_TOOLS) - cases)
    if missing:
        raise RuntimeError(f"switch-only baseline tools missing from InDesignMCPServer.js: {missing}")


def baseline_entry(tool: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": tool["id"],
        "name": tool["name"],
        "domain": tool["domain"],
        "source": tool["source"],
        "side_effects": list(tool.get("side_effects") or []),
        "destructive": bool(tool.get("destructive", False)),
        "mutates_document": bool(tool.get("mutates_document", False)),
        "writes_filesystem": bool(tool.get("writes_filesystem", False)),
        "needs_indesign": bool(tool.get("needs_indesign", False)),
        "requires_active_document": bool(tool.get("requires_active_document", False)),
    }


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Export terminal architecture contract baseline.")
    parser.add_argument("--output", default=str(GOLDEN_DIR / "contract_baseline.json"))
    parser.add_argument("--timeout-seconds", type=int, default=30)
    args = parser.parse_args()

    assert_switch_cases_present()
    entries = [baseline_entry(tool) for tool in build_current_node_catalog(args.timeout_seconds)]
    payload = {
        "schema_version": 1,
        "generated_by": "scripts/migration/contract_baseline.py",
        "expected_node_backed_count": 150,
        "count": len(entries),
        "entries": entries,
    }
    if len(entries) != 150:
        payload["warning"] = f"expected 150 Node-backed tools, got {len(entries)}"
    write_json(Path(args.output), payload)
    print(json.dumps({"output": args.output, "count": len(entries)}, ensure_ascii=False, sort_keys=True))
    return 0 if len(entries) == 150 else 1


if __name__ == "__main__":
    raise SystemExit(main())
