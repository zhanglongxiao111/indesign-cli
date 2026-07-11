from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path
from typing import Any

from ..errors import CliError
from .backend import PluginBackend
from .discovery import discover_plugins
from .manifest import (
    TOOL_ID_PATTERN,
    PluginRecord,
    load_plugin_record,
    validate_manifest,
)


REQUIRED_TOOL_FIELDS = {
    "id",
    "domain",
    "name",
    "one_line_purpose",
    "arg_names",
    "rank",
    "schema_size",
    "callable",
    "requires",
    "side_effects",
    "artifact_kinds",
    "destructive",
    "target_scope",
    "needs_indesign",
    "produces_artifacts",
    "preconditions",
    "return_example",
    "failure_example",
}


def _error(code: str, message: str, **details: Any) -> dict[str, Any]:
    return {"code": code, "message": message, "details": details}


def _schema_errors(tool: dict[str, Any], schema_payload: dict[str, Any]) -> list[dict[str, Any]]:
    errors: list[dict[str, Any]] = []
    schema = schema_payload.get("inputSchema")
    tool_id = str(tool.get("id"))
    if not isinstance(schema, dict):
        return [_error("PLUGIN_SCHEMA_INVALID", "inputSchema must be an object", tool_id=tool_id)]
    if schema.get("type") != "object":
        errors.append(_error("PLUGIN_SCHEMA_INVALID", "inputSchema.type must be object", tool_id=tool_id))
    properties = schema.get("properties")
    if not isinstance(properties, dict):
        errors.append(_error("PLUGIN_SCHEMA_INVALID", "inputSchema.properties must be an object", tool_id=tool_id))
        properties = {}
    for arg_name in tool.get("arg_names", []):
        if arg_name not in properties:
            errors.append(_error("PLUGIN_SCHEMA_INVALID", "arg_names must match inputSchema.properties", tool_id=tool_id, argument=arg_name))
    for required in schema.get("required", []):
        if required not in properties:
            errors.append(_error("PLUGIN_SCHEMA_INVALID", "required argument missing from properties", tool_id=tool_id, argument=required))
    return errors


def _tool_errors(record: PluginRecord, tool: dict[str, Any]) -> list[dict[str, Any]]:
    errors: list[dict[str, Any]] = []
    missing = sorted(field for field in REQUIRED_TOOL_FIELDS if field not in tool)
    for field in missing:
        errors.append(_error("PLUGIN_TOOL_INVALID", "Missing tool field", tool_id=tool.get("id"), field=field))
    if missing:
        return errors
    tool_id = tool["id"]
    if not isinstance(tool_id, str) or not TOOL_ID_PATTERN.match(tool_id):
        errors.append(_error("PLUGIN_TOOL_INVALID", "Invalid tool id", tool_id=tool_id))
    elif not tool_id.startswith(f"{record.domain}."):
        errors.append(_error("PLUGIN_TOOL_INVALID", "Tool id must use plugin domain", tool_id=tool_id, domain=record.domain))
    if tool.get("domain") != record.domain:
        errors.append(_error("PLUGIN_TOOL_INVALID", "Tool domain must match plugin domain", tool_id=tool_id, domain=tool.get("domain")))
    for list_field in ("arg_names", "requires", "side_effects", "artifact_kinds", "preconditions"):
        if not isinstance(tool.get(list_field), list):
            errors.append(_error("PLUGIN_TOOL_INVALID", f"{list_field} must be an array", tool_id=tool_id))
    for object_field in ("return_example", "failure_example"):
        if not isinstance(tool.get(object_field), dict):
            errors.append(_error("PLUGIN_TOOL_INVALID", f"{object_field} must be an object", tool_id=tool_id, field=object_field))
    for bool_field in ("callable", "destructive", "needs_indesign", "produces_artifacts"):
        if not isinstance(tool.get(bool_field), bool):
            errors.append(_error("PLUGIN_TOOL_INVALID", f"{bool_field} must be boolean", tool_id=tool_id))
    return errors


def validate_plugin_path(path_value: str, *, host_version: str) -> dict[str, Any]:
    errors: list[dict[str, Any]] = []
    warnings: list[dict[str, Any]] = []
    try:
        record = load_plugin_record(Path(path_value), source="validate", host_version=host_version)
    except CliError as exc:
        manifest_errors = exc.details.get("errors") if isinstance(exc.details.get("errors"), list) else None
        errors.extend(manifest_errors or [_error(exc.code, exc.message, **exc.details)])
        return {"ok": False, "plugin": None, "errors": errors, "warnings": warnings, "summary": {}}

    manifest_errors = validate_manifest(
        manifest=record.manifest,
        root=record.root,
        manifest_path=record.manifest_path,
        host_version=host_version,
    )
    errors.extend(manifest_errors)
    if errors:
        return {"ok": False, "plugin": record.id, "errors": errors, "warnings": warnings, "summary": {}}

    backend = PluginBackend(record)
    tools: list[dict[str, Any]] = []
    try:
        handshake = backend.handshake({"name": "indesign-cli", "version": host_version, "protocol": "indesign-cli-plugin.v1"})
        if handshake.get("id") != record.id:
            errors.append(_error("PLUGIN_HANDSHAKE_FAILED", "Handshake id does not match manifest", expected=record.id, actual=handshake.get("id")))
        if handshake.get("protocol") != record.manifest["protocol"]:
            errors.append(_error("PLUGIN_HANDSHAKE_FAILED", "Handshake protocol does not match manifest", expected=record.manifest["protocol"], actual=handshake.get("protocol")))
        tools = backend.list_tools()
    except CliError as exc:
        errors.append(_error(exc.code, exc.message, **exc.details))

    for tool in tools:
        errors.extend(_tool_errors(record, tool))
        if tool.get("callable") and isinstance(tool.get("id"), str):
            try:
                schema_payload = backend.schema(tool["id"])
            except CliError as exc:
                errors.append(_error(exc.code, exc.message, tool_id=tool["id"], **exc.details))
                continue
            errors.extend(_schema_errors(tool, schema_payload))

    return {
        "ok": not errors,
        "plugin": record.id,
        "errors": errors,
        "warnings": warnings,
        "summary": {
            "tools": len(tools),
            "needs_indesign": sum(1 for tool in tools if tool.get("needs_indesign")),
            "host_actions": record.manifest.get("host_actions") or record.manifest.get("capabilities", {}).get("host_actions", []),
        },
    }


def doctor_plugin(plugin_id: str, *, cwd: Path, host_version: str, deep: bool = False) -> dict[str, Any]:
    records, discovery_warnings = discover_plugins(cwd, host_version=host_version)
    record = next((item for item in records if item.id == plugin_id), None)
    if not record:
        runtime_root = os.environ.get("INDESIGN_CLI_RUNTIME_ROOT")
        if plugin_id == "html-indesign" and runtime_root:
            expected = Path(runtime_root) / "plugins" / "html-indesign" / "manifest.json"
            raise CliError(
                "Builtin HTML plugin is missing from the current runtime",
                code="BUILTIN_PLUGIN_MISSING",
                details={"id": plugin_id, "expected": str(expected)},
                hint="Reinstall or update the current indesign-cli runtime.",
            )
        raise CliError(
            "Plugin is not installed",
            code="PLUGIN_NOT_INSTALLED",
            details={"id": plugin_id},
            hint="先运行 `indesign-cli plugin list` 查看已安装插件和确切 id。",
        )

    checks: list[dict[str, Any]] = []
    checks.append({"name": "discovered", "ok": True, "source": record.source})
    session_dir = cwd / ".indesign-cli"
    try:
        session_dir.mkdir(parents=True, exist_ok=True)
        probe = session_dir / ".doctor-write-test"
        probe.write_text("ok", encoding="utf-8")
        probe.unlink()
        checks.append({"name": "session_writable", "ok": True})
    except OSError as exc:
        checks.append({"name": "session_writable", "ok": False, "message": str(exc)})

    node = shutil.which("node")
    checks.append({"name": "node_available", "ok": node is not None, "path": node})
    if node:
        completed = subprocess.run(["node", "--version"], text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
        checks.append({"name": "node_version", "ok": completed.returncode == 0, "version": completed.stdout.strip()})

    validate_payload = validate_plugin_path(str(record.root), host_version=host_version)
    checks.append({"name": "validate", "ok": validate_payload["ok"], "errors": validate_payload["errors"]})

    try:
        plugin_doctor = PluginBackend(record).doctor()
        checks.append({"name": "plugin_doctor", "ok": bool(plugin_doctor.get("ok", True)), "data": plugin_doctor})
    except CliError as exc:
        checks.append({"name": "plugin_doctor", "ok": False, "code": exc.code, "message": exc.message})

    return {
        "ok": all(check.get("ok") is True for check in checks),
        "plugin": record.id,
        "source": record.source,
        "deep": deep,
        "checks": checks,
        "warnings": discovery_warnings,
    }
