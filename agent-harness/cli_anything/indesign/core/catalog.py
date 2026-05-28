from __future__ import annotations

import re
from collections import Counter
from pathlib import Path
from typing import Any

from .domains import DOMAINS, infer_domain
from .errors import CliError
from .hidden_handler_schemas import HIDDEN_HANDLER_SCHEMAS
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
        "side_effects": [],
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
        "one_line_purpose": "检查 CLI、Node 入口和可选 InDesign 后端状态",
        "arg_names": ["deep"],
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
        "arg_names": ["verbose"],
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
        "id": "script.run",
        "domain": "script",
        "name": "run",
        "one_line_purpose": "执行 JSX 文件或 stdin 临时脚本",
        "arg_names": ["file", "stdin", "timeout"],
        "source": "script",
        "rank": 1,
        "schema_size": "small",
        "availability": "exposed",
        "callable": True,
        "requires": ["indesign_com"],
        "side_effects": ["indesign_mutation"],
        "artifact_kinds": [],
        "destructive": False,
        "target_scope": "indesign",
        "needs_indesign": True,
        "produces_artifacts": False,
    },
    {
        "id": "skill.install",
        "domain": "skill",
        "name": "install",
        "one_line_purpose": "把内置 indesign-cli skill 安装到目标项目",
        "arg_names": ["target"],
        "source": "cli",
        "rank": 1,
        "schema_size": "small",
        "availability": "exposed",
        "callable": True,
        "requires": [],
        "side_effects": ["filesystem_write"],
        "artifact_kinds": [],
        "destructive": False,
        "target_scope": "workspace",
        "needs_indesign": False,
        "produces_artifacts": True,
    },
]


HIDDEN_HANDLER_FILES = {
    "book": "src/handlers/bookHandlers.js",
    "presentation": "src/handlers/presentationHandlers.js",
}

VALID_SOURCES = {"cli", "script", "advanced", "classic", "hidden_handler", "plugin"}


def _camel_to_snake(value: str) -> str:
    value = re.sub(r"(.)([A-Z][a-z]+)", r"\1_\2", value)
    return re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", value).lower()


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


def _target_scope(domain: str, tool_name: str) -> str:
    if domain == "export":
        return "filesystem"
    if "document" in tool_name or domain == "document":
        return "active_document"
    if domain in {"server", "session"}:
        return "workspace"
    return "indesign"


def exposed_tool_entries(tools: list[dict[str, Any]], source: str) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    for index, tool in enumerate(tools):
        name = tool["name"]
        description = tool.get("description", "")
        domain = infer_domain(name, description)
        schema = tool.get("inputSchema", {})
        arg_names = list(schema.get("properties", {}).keys())
        artifact_kinds = _artifact_kinds(name)
        entries.append(
            {
                "id": f"{domain}.{name}",
                "domain": domain,
                "name": name,
                "one_line_purpose": description.splitlines()[0] if description else name,
                "arg_names": arg_names,
                "source": source,
                "rank": (10 if source == "advanced" else 20) + index,
                "schema_size": _schema_size(schema),
                "availability": "exposed",
                "callable": True,
                "requires": ["indesign_com"],
                "side_effects": _side_effects(name, domain),
                "artifact_kinds": artifact_kinds,
                "destructive": any(part in name for part in ("delete", "clear", "close")),
                "target_scope": _target_scope(domain, name),
                "needs_indesign": True,
                "produces_artifacts": bool(artifact_kinds),
            }
        )
    return entries


def plugin_tool_entries(record: PluginRecord, tools: list[dict[str, Any]]) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    for index, tool in enumerate(tools):
        tool_id = str(tool.get("id") or "")
        name = str(tool.get("name") or tool_id.split(".", 1)[-1])
        entries.append(
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
            }
        )
    return entries


class Catalog:
    def __init__(
        self,
        repo_root: Path,
        tools: list[dict[str, Any]] | None = None,
        domains: dict[str, str] | None = None,
        plugin_records: dict[str, PluginRecord] | None = None,
    ) -> None:
        self.repo_root = repo_root
        self._tools = tools or [*CLI_PRIMITIVES, *self._hidden_handler_entries()]
        self._domains = domains or dict(DOMAINS)
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
        tools = [*CLI_PRIMITIVES]
        tools.extend(exposed_tool_entries(advanced_tools or [], "advanced"))
        tools.extend(exposed_tool_entries(classic_tools or [], "classic"))
        exposed_ids = {tool["id"] for tool in tools}
        tools.extend(tool for tool in self._hidden_handler_entries() if tool["id"] not in exposed_ids)
        existing_ids = {tool["id"] for tool in tools}
        for plugin_tool in plugin_tools or []:
            if plugin_tool["id"] in existing_ids:
                raise CliError("Plugin tool id conflicts with an existing tool", code="PLUGIN_TOOL_CONFLICT", details={"tool_id": plugin_tool["id"]})
            existing_ids.add(plugin_tool["id"])
            tools.append(plugin_tool)
        domains = dict(DOMAINS)
        domains.update(plugin_domain_summaries or {})
        return Catalog(repo_root=self.repo_root, tools=tools, domains=domains, plugin_records=plugin_records or {})

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
                )
            tools = [tool for tool in tools if tool["domain"] == domain]
        if source:
            if source not in VALID_SOURCES:
                raise CliError(
                    f"Unknown source: {source}",
                    code="SOURCE_NOT_FOUND",
                    details={"source": source, "available": sorted(VALID_SOURCES)},
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

    def _hidden_handler_entries(self) -> list[dict[str, Any]]:
        entries: list[dict[str, Any]] = []
        for domain, relative_path in HIDDEN_HANDLER_FILES.items():
            path = self.repo_root / relative_path
            if not path.exists():
                continue
            content = path.read_text(encoding="utf-8")
            for method in re.findall(r"static\s+async\s+([A-Za-z0-9_]+)\s*\(", content):
                name = _camel_to_snake(method)
                tool_id = f"{domain}.{name}"
                schema = HIDDEN_HANDLER_SCHEMAS.get(tool_id, {"type": "object", "properties": {}})
                arg_names = list(schema.get("properties", {}).keys())
                callable_handler = tool_id in HIDDEN_HANDLER_SCHEMAS
                entries.append(
                    {
                        "id": tool_id,
                        "domain": domain,
                        "name": name,
                        "one_line_purpose": f"调用已有 {domain} handler 能力",
                        "arg_names": arg_names,
                        "source": "hidden_handler",
                        "rank": 90,
                        "schema_size": _schema_size(schema) if callable_handler else "unknown",
                        "availability": "exposed" if callable_handler else "hidden_handler",
                        "callable": callable_handler,
                        "requires": ["indesign_com"],
                        "side_effects": ["indesign_mutation"],
                        "artifact_kinds": _artifact_kinds(name),
                        "destructive": any(part in name for part in ("delete", "clear", "close")),
                        "target_scope": _target_scope(domain, name),
                        "needs_indesign": True,
                        "produces_artifacts": bool(_artifact_kinds(name)),
                    }
                )
        return entries
