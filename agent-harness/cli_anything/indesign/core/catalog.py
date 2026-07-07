from __future__ import annotations

import hashlib
import json
from collections import Counter
from pathlib import Path
from typing import Any

from .errors import CliError
from .plugins.manifest import PluginRecord


CLI_PRIMITIVES = [
    {
        "id": "export.verify",
        "domain": "export",
        "name": "verify",
        "one_line_purpose": "验证 PDF 或 IDML 产物是否存在且格式正确",
        "arg_names": ["path", "created_after"],
        "source": "cli",
        "rank": 1,
        "schema_size": "small",
        "availability": "exposed",
        "callable": True,
        "requires": [],
        "side_effects": ["session_write"],
        "artifact_kinds": ["pdf", "idml"],
        "destructive": False,
        "target_scope": "filesystem",
        "needs_indesign": False,
        "produces_artifacts": False,
    },
    {
        "id": "server.health",
        "domain": "server",
        "name": "health",
        "one_line_purpose": "检查 CLI、Node 入口和 InDesign 相关后端状态",
        "arg_names": ["deep", "connect_indesign"],
        "source": "cli",
        "rank": 1,
        "schema_size": "small",
        "availability": "exposed",
        "callable": True,
        "requires": [],
        "side_effects": [],
        "artifact_kinds": [],
        "destructive": False,
        "target_scope": "project",
        "needs_indesign": False,
        "produces_artifacts": False,
    },
    {
        "id": "server.setup",
        "domain": "server",
        "name": "setup",
        "one_line_purpose": "在 CLI 内置 server 目录执行 npm install",
        "arg_names": [],
        "source": "cli",
        "rank": 2,
        "schema_size": "small",
        "availability": "exposed",
        "callable": True,
        "requires": ["node", "npm"],
        "side_effects": ["filesystem_write"],
        "artifact_kinds": [],
        "destructive": False,
        "target_scope": "project",
        "needs_indesign": False,
        "produces_artifacts": False,
    },
    {
        "id": "session.show",
        "domain": "session",
        "name": "show",
        "one_line_purpose": "读取当前工作目录下的精简 CLI session",
        "arg_names": [],
        "source": "cli",
        "rank": 1,
        "schema_size": "small",
        "availability": "exposed",
        "callable": True,
        "requires": [],
        "side_effects": [],
        "artifact_kinds": [],
        "destructive": False,
        "target_scope": "workspace",
        "needs_indesign": False,
        "produces_artifacts": False,
    },
    {
        "id": "session.clear",
        "domain": "session",
        "name": "clear",
        "one_line_purpose": "清空当前工作目录下的 CLI session",
        "arg_names": [],
        "source": "cli",
        "rank": 2,
        "schema_size": "small",
        "availability": "exposed",
        "callable": True,
        "requires": [],
        "side_effects": ["session_write"],
        "artifact_kinds": [],
        "destructive": True,
        "target_scope": "workspace",
        "needs_indesign": False,
        "produces_artifacts": False,
    },
    {
        "id": "session.doctor",
        "domain": "session",
        "name": "doctor",
        "one_line_purpose": "读取最近失败、artifacts 和文档状态线索，给出下一步诊断建议",
        "arg_names": [],
        "source": "cli",
        "rank": 3,
        "schema_size": "small",
        "availability": "exposed",
        "callable": True,
        "requires": [],
        "side_effects": [],
        "artifact_kinds": [],
        "destructive": False,
        "target_scope": "workspace",
        "needs_indesign": False,
        "produces_artifacts": False,
    },
    {
        "id": "feedback.report",
        "domain": "feedback",
        "name": "report",
        "one_line_purpose": "上报 Agent 使用 indesign-cli 时遇到的工具缺口、文档不清或错误信息摩擦",
        "arg_names": ["code", "note", "tool"],
        "source": "cli.primitive",
        "rank": 1,
        "schema_size": "small",
        "availability": "exposed",
        "callable": True,
        "requires": [],
        "side_effects": ["session_write"],
        "artifact_kinds": [],
        "destructive": False,
        "target_scope": "workspace",
        "needs_indesign": False,
        "produces_artifacts": False,
    },
    {
        "id": "tool.batch",
        "domain": "tool",
        "name": "batch",
        "one_line_purpose": "按 JSON plan 顺序执行多个工具调用，失败时停止并返回 failed_step",
        "arg_names": ["plan", "on_error", "timeout_ms"],
        "source": "cli",
        "rank": 1,
        "schema_size": "small",
        "availability": "exposed",
        "callable": True,
        "requires": [],
        "side_effects": ["session_write"],
        "artifact_kinds": [],
        "destructive": False,
        "target_scope": "workspace",
        "needs_indesign": False,
        "produces_artifacts": True,
    },
    {
        "id": "script.run",
        "domain": "script",
        "name": "run",
        "one_line_purpose": "执行 JSX 文件；stdin 只适合短临时探针",
        "arg_names": ["file", "stdin", "timeout", "timeout_ms"],
        "source": "script",
        "rank": 1,
        "schema_size": "small",
        "availability": "exposed",
        "callable": True,
        "requires": ["indesign_com"],
        "side_effects": ["indesign_mutation", "session_write"],
        "artifact_kinds": [],
        "destructive": False,
        "target_scope": "indesign",
        "needs_indesign": True,
        "produces_artifacts": False,
    },
]


VALID_SOURCES = {"cli", "cli.primitive", "script", "advanced", "classic", "hidden_handler", "plugin"}
ARTIFACT_RELATIVE_PATH = Path("src") / "core" / "indesign-tool-registry.json"
ARTIFACT_FIX_HINT = "运行 `node src/core/artifact.js --write` 重新生成 registry artifact，然后重试。"

PURPOSE_OVERRIDES = {
    "execute_indesign_code": "执行短 inline ExtendScript 探针；长脚本优先用 script.run 文件模式",
}

DOMAIN_SUMMARY_OVERRIDES = {
    "template": "模板槽位、脚本标签、母版占位和模板填充",
    "document": "打开、保存、关闭、文档信息",
    "page": "页面、页面尺寸和页面基础操作",
    "spread": "跨页、跨页布局和跨页范围操作",
    "master": "母版、母版跨页和母版对象",
    "layer": "图层创建、查询、锁定、显示和删除",
    "object": "页面对象、对象组、几何位置、脚本标签",
    "text": "文本框、文本内容、段落和字符操作",
    "graphics": "图片、图形框、适配和基础绘制",
    "style": "段落样式、字符样式、对象样式",
    "export": "PDF、IDML、图片等导出和产物验证",
    "book": "InDesign Book 文件、章节和书籍级同步",
    "presentation": "演示型版面、页面序列和 internal handler 能力",
    "tool": "工具发现、schema、调用和批处理编排",
    "script": "JSX 文件执行和 stdin 临时脚本",
    "session": "CLI 本地状态、最近文档和最近输出",
    "feedback": "Agent 使用摩擦上报和反馈闭环",
    "server": "依赖、后端、InDesign COM 健康检查",
    "utility": "难以归入以上域的辅助能力",
}

SOURCE_RANK_BASE = {
    "advanced": 10,
    "classic": 20,
    "hidden_handler": 90,
}


def _schema_size(schema: dict[str, Any]) -> str:
    count = len(schema.get("properties", {}))
    if count <= 3:
        return "small"
    if count <= 8:
        return "medium"
    return "large"


def _side_effects(tool_name: str, domain: str) -> list[str]:
    if tool_name.startswith(("get_", "list_", "inspect_", "find_", "search_")):
        return []
    if domain == "export" or "export" in tool_name or "package" in tool_name:
        return ["filesystem_write"]
    return ["indesign_mutation"]


def _artifact_kinds(tool_name: str) -> list[str]:
    kinds: list[str] = []
    lowered = tool_name.lower()
    if "pdf" in lowered:
        kinds.append("pdf")
    if "idml" in lowered:
        kinds.append("idml")
    if "image" in lowered or "png" in lowered or "jpg" in lowered:
        kinds.append("image")
    if "epub" in lowered:
        kinds.append("epub")
    return kinds


def _artifact_kinds_from_schema(tool_name: str, schema: dict[str, Any]) -> list[str]:
    kinds = _artifact_kinds(tool_name)
    properties = schema.get("properties") if isinstance(schema.get("properties"), dict) else {}
    format_schema = properties.get("format") if isinstance(properties.get("format"), dict) else {}
    for item in format_schema.get("enum", []):
        lowered = str(item).lower()
        if lowered and lowered not in kinds:
            kinds.append(lowered)
    if tool_name == "create_book" and "indb" not in kinds:
        kinds.append("indb")
    if "preflight" in tool_name and "report" not in kinds:
        kinds.append("report")
    return kinds


def _destructive(tool_name: str) -> bool:
    return any(part in tool_name for part in ("delete", "clear", "close"))


def _target_scope(domain: str, tool_name: str) -> str:
    if domain == "export" or "export" in tool_name or "package" in tool_name:
        return "filesystem"
    if domain == "book":
        if "export" in tool_name or "package" in tool_name or tool_name == "create_book":
            return "filesystem"
        if "print" in tool_name:
            return "printer"
        return "indesign_book"
    if "document" in tool_name or domain == "document":
        return "active_document"
    if domain in {"server", "session"}:
        return "workspace"
    return "indesign"


def canonical_switch_only_entry(*, domain: str, name: str, handler: str, rank: int = 95) -> dict[str, Any]:
    artifact_kinds = _artifact_kinds(name)
    return _with_agent_contract(
        {
            "id": f"{domain}.{name}",
            "domain": domain,
            "name": name,
            "one_line_purpose": f"switch-only handler: {handler}",
            "arg_names": [],
            "source": "switch_only_no_cli_schema",
            "rank": rank,
            "schema_size": "unknown",
            "availability": "hidden_handler",
            "callable": False,
            "requires": ["indesign_com"],
            "side_effects": _side_effects(name, domain),
            "artifact_kinds": artifact_kinds,
            "destructive": _destructive(name),
            "target_scope": _target_scope(domain, name),
            "needs_indesign": True,
            "produces_artifacts": bool(artifact_kinds),
        }
    )


def _agent_contract(tool: dict[str, Any]) -> dict[str, Any]:
    tool_id = str(tool.get("id") or "")
    domain = str(tool.get("domain") or "")
    name = str(tool.get("name") or "")
    side_effects = list(tool.get("side_effects") or [])
    artifact_kinds = list(tool.get("artifact_kinds") or [])
    target_scope = str(tool.get("target_scope") or "")
    needs_indesign = bool(tool.get("needs_indesign", False))
    destructive = bool(tool.get("destructive", False))
    writes_filesystem = "filesystem_write" in side_effects or domain == "export" or any(
        word in name for word in ("export", "package", "save")
    )
    mutates_document = needs_indesign and bool(side_effects) and "filesystem_write" not in side_effects
    if "indesign_mutation" in side_effects or destructive:
        mutates_document = True
    returns_artifacts = bool(tool.get("produces_artifacts") or artifact_kinds or writes_filesystem)
    requires_active_document = target_scope == "active_document" or (
        needs_indesign and name.startswith(("get_", "create_", "edit_", "place_", "export_", "save_", "close_", "package_")) and name != "create_document"
    )
    contract: dict[str, Any] = {
        "requires_active_document": requires_active_document,
        "requires_active_page": needs_indesign and domain in {"page", "text", "graphics", "object"},
        "uses_selection": "selection" in name or "select" in name,
        "opens_document": name.startswith("open_") or tool_id == "template.inspect_template_blueprint",
        "closes_document": name.startswith("close_"),
        "may_close_document": name.startswith("close_") or tool_id == "template.inspect_template_blueprint",
        "mutates_document": mutates_document,
        "writes_filesystem": writes_filesystem,
        "returns_artifacts": returns_artifacts,
        "return_shape": {
            "success": "boolean",
            "data": "object",
            "warnings": "array",
            "artifacts": "array" if returns_artifacts else "optional array",
        },
        "return_example": {"success": True, "data": {}, "artifacts": [] if returns_artifacts else None},
        # MCP 后端工具失败走 MCP_TOOL_FAILED；CLI/script/hidden 原语失败码见各自 error.code
        "failure_example": (
            {"success": False, "code": "MCP_TOOL_FAILED", "message": "Tool failed"}
            if str(tool.get("source") or "") in {"advanced", "classic"}
            else {"ok": False, "error": {"code": "CLI_ERROR", "message": "Tool failed"}}
        ),
        "preconditions": [],
        "safe_usage_notes": [],
        "common_next_steps": ["Inspect the returned data before chaining the next operation."],
    }
    if requires_active_document:
        contract["preconditions"].append("An explicit or active InDesign document is required.")
    if writes_filesystem:
        contract["safe_usage_notes"].append("Use explicit output paths and verify artifacts after the call.")
        contract["common_next_steps"].append("Run `indesign-cli export verify <path>` for supported exported artifacts.")
    if destructive or contract["may_close_document"]:
        contract["safe_usage_notes"].append("Confirm the target document when multiple documents are open.")
    overrides: dict[str, dict[str, Any]] = {
        "export.verify": {
            "failure_example": {"ok": False, "error": {"code": "ARTIFACT_NOT_FOUND", "message": "Artifact not found"}},
        },
        "document.close_document": {
            "may_close_document": True,
            "closes_document": True,
            "mutates_document": True,
            "requires_active_document": True,
        },
        "document.save_document": {"mutates_document": True, "requires_active_document": True},
        "export.export_pdf": {"writes_filesystem": True, "returns_artifacts": True},
        "export.export_images": {"writes_filesystem": True, "returns_artifacts": True},
        "template.inspect_template_blueprint": {"opens_document": True, "may_close_document": True},
        "script.run": {
            "mutates_document": True,
            "safe_usage_notes": ["Complex JSX should use a JSON diagnostic wrapper and explicit timeout."],
        },
    }
    contract.update(overrides.get(tool_id, {}))
    return contract


def _with_agent_contract(tool: dict[str, Any]) -> dict[str, Any]:
    merged = dict(tool)
    for key, value in _agent_contract(merged).items():
        merged.setdefault(key, value)
    return merged


def _stable_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _read_registry_artifact(repo_root: Path) -> dict[str, Any]:
    artifact_path = repo_root / ARTIFACT_RELATIVE_PATH
    if not artifact_path.exists():
        raise CliError(
            "Registry artifact is missing",
            code="REGISTRY_ARTIFACT_NOT_FOUND",
            details={"path": str(artifact_path)},
            hint=ARTIFACT_FIX_HINT,
        )
    try:
        artifact = json.loads(artifact_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise CliError(
            "Registry artifact is not valid JSON",
            code="REGISTRY_ARTIFACT_INVALID",
            details={"path": str(artifact_path)},
            hint=ARTIFACT_FIX_HINT,
        ) from exc
    if not isinstance(artifact, dict) or not isinstance(artifact.get("sources"), dict):
        raise CliError(
            "Registry artifact has an invalid shape",
            code="REGISTRY_ARTIFACT_INVALID",
            details={"path": str(artifact_path)},
            hint=ARTIFACT_FIX_HINT,
        )
    hash_input = {
        "schema_version": artifact.get("schema_version"),
        "tool_count": artifact.get("tool_count"),
        "sources": artifact.get("sources"),
    }
    actual_hash = hashlib.sha256(_stable_json(hash_input).encode("utf-8")).hexdigest()
    if artifact.get("registry_hash") != actual_hash:
        raise CliError(
            "Registry artifact hash does not match its contents",
            code="REGISTRY_ARTIFACT_HASH_MISMATCH",
            details={
                "path": str(artifact_path),
                "expected": artifact.get("registry_hash"),
                "actual": actual_hash,
            },
            hint=ARTIFACT_FIX_HINT,
        )
    return artifact


def _contract_side_effects(contract: dict[str, Any]) -> list[str]:
    effects: list[str] = []
    if contract.get("writesFilesystem"):
        effects.append("filesystem_write")
    if contract.get("mutatesDocument"):
        effects.append("indesign_mutation")
    return effects


def _artifact_entry(tool: dict[str, Any], *, source: str, index: int) -> tuple[dict[str, Any], dict[str, Any]]:
    schema = tool.get("inputSchema") if isinstance(tool.get("inputSchema"), dict) else {"type": "object", "properties": {}}
    cli = tool.get("cli") if isinstance(tool.get("cli"), dict) else {}
    contract = tool.get("contract") if isinstance(tool.get("contract"), dict) else {}
    tool_id = str(cli.get("id") or f"{tool.get('domain')}.{tool.get('name')}")
    name = str(tool.get("name") or tool_id.split(".", 1)[-1])
    domain = str(tool.get("domain") or cli.get("domain") or tool_id.split(".", 1)[0])
    artifact_kinds = _artifact_kinds_from_schema(name, schema)
    entry = _with_agent_contract(
        {
            "id": tool_id,
            "domain": domain,
            "name": name,
            "one_line_purpose": PURPOSE_OVERRIDES.get(name, f"{domain.title()} tool {name}"),
            "arg_names": list(schema.get("properties", {}).keys()),
            "source": source,
            "rank": SOURCE_RANK_BASE.get(source, 50) + index,
            "schema_size": _schema_size(schema),
            "availability": "exposed",
            "callable": True,
            "requires": ["indesign_com"] if contract.get("needsInDesign", True) else [],
            "side_effects": _contract_side_effects(contract),
            "artifact_kinds": artifact_kinds,
            "destructive": bool(contract.get("destructive", False)),
            "target_scope": _target_scope(domain, name),
            "needs_indesign": bool(contract.get("needsInDesign", True)),
            "produces_artifacts": bool(contract.get("producesArtifacts", False)),
        }
    )
    entry.update(
        {
            "requires_active_document": bool(contract.get("requiresActiveDocument", entry.get("requires_active_document", False))),
            "mutates_document": bool(contract.get("mutatesDocument", entry.get("mutates_document", False))),
            "writes_filesystem": bool(contract.get("writesFilesystem", entry.get("writes_filesystem", False))),
            "returns_artifacts": bool(contract.get("producesArtifacts", entry.get("returns_artifacts", False))),
        }
    )
    return entry, schema


def artifact_tool_entries(repo_root: Path) -> tuple[list[dict[str, Any]], dict[str, dict[str, Any]], dict[str, str]]:
    artifact = _read_registry_artifact(repo_root)
    entries: list[dict[str, Any]] = []
    schemas: dict[str, dict[str, Any]] = {}
    domains: dict[str, str] = {}
    count = 0
    for source, tools in artifact["sources"].items():
        if source not in {"advanced", "classic", "hidden_handler"}:
            raise CliError(
                "Registry artifact contains an unsupported source",
                code="REGISTRY_ARTIFACT_INVALID",
                details={"source": source},
                hint=ARTIFACT_FIX_HINT,
            )
        if not isinstance(tools, list):
            raise CliError(
                "Registry artifact source group must be an array",
                code="REGISTRY_ARTIFACT_INVALID",
                details={"source": source},
                hint=ARTIFACT_FIX_HINT,
            )
        for index, tool in enumerate(tools):
            entry, schema = _artifact_entry(tool, source=source, index=index)
            entries.append(entry)
            schemas[entry["id"]] = schema
            domains.setdefault(entry["domain"], DOMAIN_SUMMARY_OVERRIDES.get(entry["domain"], f"{entry['domain']} tools"))
            count += 1
    if count != artifact.get("tool_count"):
        raise CliError(
            "Registry artifact tool count does not match source groups",
            code="REGISTRY_ARTIFACT_INVALID",
            details={"expected": artifact.get("tool_count"), "actual": count},
            hint=ARTIFACT_FIX_HINT,
        )
    return entries, schemas, domains


def plugin_tool_entries(record: PluginRecord, tools: list[dict[str, Any]]) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    for index, tool in enumerate(tools):
        tool_id = str(tool.get("id") or "")
        name = str(tool.get("name") or tool_id.split(".", 1)[-1])
        entries.append(
            _with_agent_contract(
            {
                "id": tool_id,
                "domain": str(tool.get("domain") or record.domain),
                "name": name,
                "one_line_purpose": str(tool.get("one_line_purpose") or tool.get("description") or name),
                "arg_names": list(tool.get("arg_names") or []),
                "source": "plugin",
                "plugin": record.id,
                "rank": int(tool.get("rank") or (70 + index)),
                "schema_size": str(tool.get("schema_size") or "medium"),
                "availability": "exposed",
                "callable": bool(tool.get("callable", True)),
                "requires": list(tool.get("requires") or []),
                "side_effects": list(tool.get("side_effects") or []),
                "artifact_kinds": list(tool.get("artifact_kinds") or []),
                "destructive": bool(tool.get("destructive", False)),
                "target_scope": str(tool.get("target_scope") or "workspace"),
                "needs_indesign": bool(tool.get("needs_indesign", False)),
                "produces_artifacts": bool(tool.get("produces_artifacts", False)),
                "preconditions": list(tool.get("preconditions") or []),
                "return_example": tool.get("return_example") if isinstance(tool.get("return_example"), dict) else {},
                "failure_example": tool.get("failure_example") if isinstance(tool.get("failure_example"), dict) else {},
            }
            )
        )
    return entries


class Catalog:
    def __init__(
        self,
        repo_root: Path,
        tools: list[dict[str, Any]] | None = None,
        domains: dict[str, str] | None = None,
        schemas: dict[str, dict[str, Any]] | None = None,
        plugin_records: dict[str, PluginRecord] | None = None,
    ) -> None:
        self.repo_root = repo_root
        if tools is None:
            artifact_tools, artifact_schemas, artifact_domains = artifact_tool_entries(repo_root)
            self._tools = [_with_agent_contract(tool) for tool in [*CLI_PRIMITIVES, *artifact_tools]]
            self._schemas = dict(artifact_schemas)
            self._domains = self._domain_summaries(self._tools, artifact_domains)
        else:
            self._tools = [_with_agent_contract(tool) for tool in tools]
            self._schemas = dict(schemas or {})
            self._domains = self._domain_summaries(self._tools, domains or {})
        self._plugin_records = plugin_records or {}

    def with_exposed_tools(
        self,
        *,
        advanced_tools: list[dict[str, Any]] | None = None,
        classic_tools: list[dict[str, Any]] | None = None,
        plugin_tools: list[dict[str, Any]] | None = None,
        plugin_domain_summaries: dict[str, str] | None = None,
        plugin_records: dict[str, PluginRecord] | None = None,
    ) -> "Catalog":
        if advanced_tools or classic_tools:
            raise CliError(
                "Node-backed tools must come from the registry artifact",
                code="CATALOG_ARTIFACT_ONLY",
                hint=ARTIFACT_FIX_HINT,
            )
        tools = list(self._tools)
        schemas = dict(self._schemas)
        existing_ids = {tool["id"] for tool in tools}
        for plugin_tool in plugin_tools or []:
            if plugin_tool["id"] in existing_ids:
                raise CliError("Plugin tool id conflicts with an existing tool", code="PLUGIN_TOOL_CONFLICT", details={"tool_id": plugin_tool["id"]})
            existing_ids.add(plugin_tool["id"])
            tools.append(plugin_tool)
        domains = dict(self._domains)
        domains.update(plugin_domain_summaries or {})
        return Catalog(repo_root=self.repo_root, tools=tools, domains=domains, schemas=schemas, plugin_records=plugin_records or {})

    @staticmethod
    def _domain_summaries(tools: list[dict[str, Any]], existing: dict[str, str]) -> dict[str, str]:
        domains = dict(existing)
        for tool in tools:
            domain = str(tool.get("domain") or "")
            if domain:
                domains.setdefault(domain, DOMAIN_SUMMARY_OVERRIDES.get(domain, f"{domain} tools"))
        return domains

    def domains(self) -> list[dict[str, Any]]:
        source_counts: dict[str, Counter[str]] = {domain: Counter() for domain in self._domains}
        top_tools: dict[str, list[dict[str, Any]]] = {domain: [] for domain in self._domains}
        for tool in self._tools:
            domain = tool["domain"]
            source_counts.setdefault(domain, Counter())[tool["source"]] += 1
            top_tools.setdefault(domain, []).append(tool)

        result = []
        for domain, summary in self._domains.items():
            ranked = sorted(top_tools.get(domain, []), key=lambda item: (item["rank"], item["id"]))
            callable_ranked = [item for item in ranked if item["callable"]]
            result.append(
                {
                    "domain": domain,
                    "summary": summary,
                    "count_by_source": dict(source_counts.get(domain, Counter())),
                    "top_tools": [item["id"] for item in callable_ranked[:5]],
                }
            )
        return result

    def list_tools(
        self,
        *,
        domain: str | None = None,
        source: str | None = None,
        callable_only: bool = False,
        query: str | None = None,
    ) -> list[dict[str, Any]]:
        tools = self._tools
        if domain:
            if domain not in self._domains:
                raise CliError(
                    f"Unknown domain: {domain}",
                    code="DOMAIN_NOT_FOUND",
                    details={"domain": domain, "available": list(self._domains)},
                    hint="先运行 `indesign-cli tool domains` 查看可用域；插件域缺失时运行 `indesign-cli plugin list`，需要时再 `indesign-cli plugin install <plugin-root>`。",
                )
            tools = [tool for tool in tools if tool["domain"] == domain]
        if source:
            if source not in VALID_SOURCES:
                raise CliError(
                    f"Unknown source: {source}",
                    code="SOURCE_NOT_FOUND",
                    details={"source": source, "available": sorted(VALID_SOURCES)},
                    hint="先运行 `indesign-cli tool list` 查看工具来源；插件相关问题用 `indesign-cli plugin list` 检查。",
                )
            tools = [tool for tool in tools if tool["source"] == source]
        if callable_only:
            tools = [tool for tool in tools if tool["callable"]]
        if query:
            needle = query.lower()
            tools = [
                tool
                for tool in tools
                if needle in tool["id"].lower()
                or needle in tool["name"].lower()
                or needle in tool["one_line_purpose"].lower()
            ]
        return sorted(tools, key=lambda item: (item["rank"], item["id"]))

    def plugin_record(self, plugin_id: str) -> PluginRecord:
        try:
            return self._plugin_records[plugin_id]
        except KeyError as exc:
            raise CliError("Plugin record missing from catalog", code="PLUGIN_RECORD_NOT_FOUND", details={"plugin": plugin_id}) from exc

    def schema(self, tool_id: str) -> dict[str, Any]:
        try:
            return self._schemas[tool_id]
        except KeyError as exc:
            raise CliError(f"Registry artifact schema missing: {tool_id}", code="SCHEMA_NOT_FOUND") from exc
