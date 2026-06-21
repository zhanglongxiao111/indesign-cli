from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from . import __version__
from .core.artifacts import parse_timestamp, verify_artifact
from .core.catalog import Catalog
from .core.catalog import plugin_tool_entries
from .core.envelope import failure, now_ms, success
from .core.errors import CliError
from .core.health import health
from .core.mcp_backend import McpBackend
from .core.node_setup import setup_node_dependencies
from .core.plugins.backend import PluginBackend
from .core.plugins.discovery import discover_plugins
from .core.plugins.install import install_plugin, list_plugins, remove_plugin
from .core.plugins.validate import doctor_plugin, validate_plugin_path
from .core.router import Router, load_args
from .core.runtime import install_skill, resolve_server_root
from .core.scripts import run_script, run_stdin_script
from .core.session import SessionStore


SERVER_ROOT = resolve_server_root()
REPO_ROOT = SERVER_ROOT


def emit(payload: dict[str, Any]) -> int:
    print(json.dumps(payload, ensure_ascii=True, indent=2))
    return int(payload.get("exit_code", 0))


def version_payload() -> dict[str, Any]:
    return success(
        command="version",
        data={
            "name": "indesign-cli",
            "version": __version__,
            "aliases": ["cli-anything-indesign"],
        },
        duration_ms=0,
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="indesign-cli",
        description="Agent 专用 InDesign CLI：发现工具、查询 schema、执行 JSX、验证产物和管理插件。",
    )
    parser.add_argument("--version", action="store_true", help="输出版本 JSON")
    parser.add_argument("--json", action="store_true", help="保留给 Agent 调用；当前默认输出 JSON")
    parser.add_argument("--pretty", action="store_true", help="保留缩进 JSON，便于 Agent 调试")
    subparsers = parser.add_subparsers(dest="group")

    tool_parser = subparsers.add_parser("tool", help="发现工具、查询 schema、调用工具")
    tool_sub = tool_parser.add_subparsers(dest="tool_command")
    tool_sub.add_parser("domains", help="列出紧凑工具域摘要")
    list_parser = tool_sub.add_parser(
        "list",
        help="列出工具；不带过滤条件时返回工具域摘要",
        description="列出工具；不带过滤条件时返回工具域摘要。",
    )
    list_parser.add_argument("--domain", help="只列指定工具域")
    list_parser.add_argument("--source", help="只列指定来源：cli/script/advanced/classic/hidden_handler/plugin")
    list_parser.add_argument("--callable-only", action="store_true", help="只列可调用工具")
    search_parser = tool_sub.add_parser("search", help="按关键词查找工具")
    search_parser.add_argument("--domain", help="限定工具域")
    search_parser.add_argument("--source", help="限定工具来源")
    search_parser.add_argument("--query", required=True, help="搜索关键词")
    schema_parser = tool_sub.add_parser("schema", help="查询指定工具的精确 JSON 参数 schema")
    schema_parser.add_argument("tool_id", help="工具 id，例如 export.verify")
    call_parser = tool_sub.add_parser("call", help="用 JSON args 调用工具；会写入当前目录 session")
    call_parser.add_argument("tool_id", help="工具 id")
    call_parser.add_argument("--args", required=True, help="JSON 参数文件路径；用 - 从 stdin 读取 JSON")
    call_parser.add_argument("--timeout", type=int, help="MCP/script backend timeout in seconds")

    script_parser = subparsers.add_parser("script", help="执行 JSX 文件或 stdin 短探针")
    script_sub = script_parser.add_subparsers(dest="script_command")
    run_parser = script_sub.add_parser("run", help="执行 JSX；文件模式优先，成功或失败都会写 session")
    run_parser.add_argument("file", nargs="?", help="JSX 文件路径")
    run_parser.add_argument("--stdin", action="store_true", help="从 stdin 读取短临时 JSX")
    run_parser.add_argument("--timeout", type=int, default=300, help="Script backend timeout in seconds")

    export_parser = subparsers.add_parser("export", help="验证导出产物")
    export_sub = export_parser.add_subparsers(dest="export_command")
    verify_parser = export_sub.add_parser("verify", help="验证 PDF/IDML 是否存在且格式正确；成功会写 session")
    verify_parser.add_argument("path", help="产物路径")
    verify_parser.add_argument("--created-after", help="ISO 时间戳，防止验证旧产物")

    session_parser = subparsers.add_parser("session", help="读取或清理当前目录 .indesign-cli/session.json")
    session_sub = session_parser.add_subparsers(dest="session_command")
    show_parser = session_sub.add_parser("show", help="读取最近调用和允许展示的路径线索")
    show_parser.add_argument("--verbose", action="store_true", help="显示更详细 session")
    session_sub.add_parser("clear", help="清空当前目录 session")

    server_parser = subparsers.add_parser("server", help="检查或安装内置 Node server 依赖")
    server_sub = server_parser.add_subparsers(dest="server_command")
    health_parser = server_sub.add_parser("health", help="检查 CLI/Node/server；--deep 额外检查 winax")
    health_parser.add_argument("--deep", action="store_true", help="执行较深依赖检查，但仍不主动连接 InDesign COM")
    server_sub.add_parser("setup", help="在内置 server 目录执行 npm install")

    skill_parser = subparsers.add_parser("skill", help="安装内置 Agent skill 到目标项目")
    skill_sub = skill_parser.add_subparsers(dest="skill_command")
    install_parser = skill_sub.add_parser("install", help="复制 skills/indesign-cli/SKILL.md 到目标项目")
    install_parser.add_argument("--target", default=".", help="目标项目根目录，默认当前目录")

    plugin_parser = subparsers.add_parser("plugin", help="管理接入 indesign-cli 的外部插件")
    plugin_sub = plugin_parser.add_subparsers(dest="plugin_command")
    plugin_sub.add_parser("list", help="列出当前项目已安装插件")
    plugin_install = plugin_sub.add_parser("install", help="安装本地插件到当前项目")
    plugin_install.add_argument("path", help="插件根目录或 manifest.json")
    plugin_remove = plugin_sub.add_parser("remove", help="移除当前项目插件记录")
    plugin_remove.add_argument("id", help="插件 id")
    plugin_validate = plugin_sub.add_parser("validate", help="只读校验插件目录是否符合协议")
    plugin_validate.add_argument("path", help="插件根目录或 manifest.json")
    plugin_doctor = plugin_sub.add_parser(
        "doctor",
        help="诊断已安装插件；会写入临时 session 探针",
        description="诊断已安装插件；会写入临时 session 探针。",
    )
    plugin_doctor.add_argument("id", help="插件 id")
    plugin_doctor.add_argument("--deep", action="store_true", help="保留给深度诊断")
    return parser


def build_catalog_with_backends() -> tuple[Catalog, list[str]]:
    base = Catalog(repo_root=REPO_ROOT)
    warnings: list[str] = []
    advanced_tools: list[dict[str, Any]] = []
    classic_tools: list[dict[str, Any]] = []
    plugin_tools: list[dict[str, Any]] = []
    plugin_domain_summaries: dict[str, str] = {}
    plugin_records = {}
    for source, entry, sink in (
        ("advanced", "src/advanced/index.js", advanced_tools),
        ("classic", "src/index.js", classic_tools),
    ):
        try:
            sink.extend(McpBackend(repo_root=REPO_ROOT, entry=entry).list_tools())
        except CliError as exc:
            warnings.append(f"{source} backend unavailable: {exc.code}")
    try:
        discovered, plugin_warnings = discover_plugins(Path.cwd(), host_version=__version__)
        warnings.extend(plugin_warnings)
    except CliError as exc:
        discovered = []
        warnings.append(f"plugin discovery unavailable: {exc.code}")
    for record in discovered:
        try:
            backend = PluginBackend(record)
            backend.handshake({"name": "indesign-cli", "version": __version__, "protocol": record.manifest["protocol"]})
            plugin_tools.extend(plugin_tool_entries(record, backend.list_tools()))
            plugin_domain_summaries[record.domain] = str(record.manifest.get("description") or f"{record.id} plugin tools")
            plugin_records[record.id] = record
        except CliError as exc:
            warnings.append(f"plugin {record.id} unavailable: {exc.code}")
    return (
        base.with_exposed_tools(
            advanced_tools=advanced_tools,
            classic_tools=classic_tools,
            plugin_tools=plugin_tools,
            plugin_domain_summaries=plugin_domain_summaries,
            plugin_records=plugin_records,
        ),
        warnings,
    )


def emit_check(command: str, data: dict[str, Any], *, tool_id: str | None = None) -> int:
    payload = success(command=command, data=data, duration_ms=0, tool_id=tool_id)
    if data.get("ok") is False:
        payload["ok"] = False
        payload["exit_code"] = 1
        payload["tool_success"] = False
    return emit(payload)


def run(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.version:
        return emit(version_payload())
    if args.group == "tool":
        catalog, warnings = build_catalog_with_backends()
        if args.tool_command == "domains" or args.tool_command is None:
            return emit(success(command="tool domains", data=catalog.domains(), duration_ms=0, warnings=warnings))
        if args.tool_command == "list":
            if not args.domain and not args.source:
                return emit(success(command="tool list", data=catalog.domains(), duration_ms=0, warnings=warnings))
            data = catalog.list_tools(
                domain=args.domain,
                source=args.source,
                callable_only=args.callable_only,
            )
            return emit(success(command="tool list", data=data, duration_ms=0, warnings=warnings))
        if args.tool_command == "search":
            data = catalog.list_tools(domain=args.domain, source=args.source, query=args.query)
            return emit(success(command="tool search", data=data, duration_ms=0, warnings=warnings))
        router = Router(catalog=catalog, repo_root=REPO_ROOT, backend_timeout_seconds=getattr(args, "timeout", None))
        if args.tool_command == "schema":
            data = router.schema(args.tool_id)
            return emit(success(command="tool schema", data=data, duration_ms=0, tool_id=args.tool_id, warnings=warnings))
        if args.tool_command == "call":
            call_args = load_args(args.args)
            tool = router._find(args.tool_id)
            store = SessionStore(Path.cwd())
            try:
                data = router.call(args.tool_id, call_args)
            except CliError:
                store.record_call(
                    tool_id=args.tool_id,
                    domain=tool["domain"],
                    source=tool["source"],
                    ok=False,
                    duration_ms=0,
                    plugin=tool.get("plugin"),
                )
                raise
            store.record_call(
                tool_id=args.tool_id,
                domain=tool["domain"],
                source=tool["source"],
                ok=True,
                duration_ms=0,
                plugin=tool.get("plugin"),
                artifacts=data.get("artifacts") if isinstance(data, dict) else None,
            )
            return emit(
                success(
                    command="tool call",
                    data=data,
                    duration_ms=0,
                    tool_id=args.tool_id,
                    domain=tool["domain"],
                    source=tool["source"],
                    warnings=warnings,
                )
            )
    if args.group == "plugin":
        if args.plugin_command == "list" or args.plugin_command is None:
            data = list_plugins(cwd=Path.cwd(), host_version=__version__)
            return emit(success(command="plugin list", data=data, duration_ms=0, tool_id="plugin.list", domain="plugin", source="cli", warnings=data.get("warnings", [])))
        if args.plugin_command == "install":
            data = install_plugin(args.path, cwd=Path.cwd(), host_version=__version__)
            return emit(success(command="plugin install", data=data, duration_ms=0, tool_id="plugin.install", domain="plugin", source="cli"))
        if args.plugin_command == "remove":
            data = remove_plugin(args.id, cwd=Path.cwd())
            return emit(success(command="plugin remove", data=data, duration_ms=0, tool_id="plugin.remove", domain="plugin", source="cli"))
        if args.plugin_command == "validate":
            data = validate_plugin_path(args.path, host_version=__version__)
            return emit_check("plugin validate", data, tool_id="plugin.validate")
        if args.plugin_command == "doctor":
            data = doctor_plugin(args.id, cwd=Path.cwd(), host_version=__version__, deep=bool(args.deep))
            return emit_check("plugin doctor", data, tool_id="plugin.doctor")
    if args.group == "script" and args.script_command == "run":
        catalog, warnings = build_catalog_with_backends()
        router = Router(catalog=catalog, repo_root=REPO_ROOT, backend_timeout_seconds=args.timeout)
        store = SessionStore(Path.cwd())
        try:
            if args.stdin:
                data = run_stdin_script(router, Path.cwd())
            elif args.file:
                data = run_script(router, Path(args.file))
            else:
                raise CliError("script run requires a file path or --stdin", code="SCRIPT_INPUT_REQUIRED")
        except Exception:
            store.record_call(tool_id="script.run", domain="script", source="script", ok=False, duration_ms=0)
            raise
        store.record_call(tool_id="script.run", domain="script", source="script", ok=True, duration_ms=0)
        return emit(success(command="script run", data=data, duration_ms=0, tool_id="script.run", domain="script", source="script", warnings=warnings))
    if args.group == "export" and args.export_command == "verify":
        try:
            created_after = parse_timestamp(args.created_after) if args.created_after else None
        except ValueError as exc:
            raise CliError("created-after must be an ISO timestamp", code="BAD_TIMESTAMP") from exc
        data = verify_artifact(Path(args.path), created_after=created_after, cwd=Path.cwd())
        SessionStore(Path.cwd()).record_call(tool_id="export.verify", domain="export", source="cli", ok=True, duration_ms=0)
        return emit(success(command="export verify", data=data, duration_ms=0, tool_id="export.verify", domain="export", source="cli"))
    if args.group == "session":
        store = SessionStore(Path.cwd())
        if args.session_command == "show" or args.session_command is None:
            data = store.read(compact=not getattr(args, "verbose", False))
            return emit(success(command="session show", data=data, duration_ms=0, tool_id="session.show"))
        if args.session_command == "clear":
            store.clear()
            return emit(success(command="session clear", data={"cleared": True}, duration_ms=0, tool_id="session.clear"))
    if args.group == "server" and (args.server_command == "health" or args.server_command is None):
        data = health(REPO_ROOT, deep=getattr(args, "deep", False))
        return emit(success(command="server health", data=data, duration_ms=0, tool_id="server.health"))
    if args.group == "server" and args.server_command == "setup":
        data = setup_node_dependencies(REPO_ROOT)
        return emit(success(command="server setup", data=data, duration_ms=0, tool_id="server.setup", domain="server", source="cli"))
    if args.group == "skill" and args.skill_command == "install":
        data = install_skill(Path(args.target))
        return emit(success(command="skill install", data=data, duration_ms=0, tool_id="skill.install", domain="skill", source="cli"))
    raise CliError(
        "Command is required",
        code="COMMAND_REQUIRED",
        details={"groups": ["tool", "script", "export", "session", "server", "skill", "plugin"]},
        hint="先用 tool domains 查看工具域，或用 tool search --query <关键词> 查找工具。",
    )


def safe_command(argv: list[str] | None) -> str:
    parts = list(argv if argv is not None else sys.argv[1:])
    while parts and parts[0] in {"--json", "--pretty"}:
        parts.pop(0)
    if not parts:
        return "cli"
    if parts[0] == "tool" and len(parts) > 1:
        return f"tool {parts[1]}"
    if parts[0] in {"script", "export", "session", "skill", "plugin"} and len(parts) > 1:
        return f"{parts[0]} {parts[1]}"
    return parts[0]


def main(argv: list[str] | None = None) -> int:
    start = now_ms()
    try:
        return run(argv)
    except CliError as exc:
        duration_ms = now_ms() - start
        return emit(failure(command=safe_command(argv), error=exc, duration_ms=duration_ms))
    except Exception as exc:
        duration_ms = now_ms() - start
        error = CliError("Unexpected CLI error", code="UNEXPECTED_ERROR", details={"type": exc.__class__.__name__})
        return emit(failure(command=safe_command(argv), error=error, duration_ms=duration_ms))
