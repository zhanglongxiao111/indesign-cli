from __future__ import annotations

from collections import defaultdict
import json
import os
from pathlib import Path
from typing import Any
import uuid

from ..errors import CliError
from .manifest import PluginRecord, load_installed_plugin, load_plugin_record


PLUGIN_CATALOG_CACHE_SCHEMA_VERSION = 1


SOURCE_PRIORITY = {
    "project": 1,
    "user": 2,
    "entry_point": 3,
    "builtin": 4,
}


def project_plugin_dir(cwd: Path) -> Path:
    return cwd / ".indesign-cli" / "plugins"


def user_plugin_dir(home: Path | None = None) -> Path:
    base = home or Path.home()
    return base / ".indesign-cli" / "plugins"


def builtin_plugin_dir() -> Path | None:
    runtime_root = os.environ.get("INDESIGN_CLI_RUNTIME_ROOT")
    return Path(runtime_root) / "plugins" if runtime_root else None


def discover_builtin_plugins(*, host_version: str) -> tuple[list[PluginRecord], list[str]]:
    directory = builtin_plugin_dir()
    if directory is None or not directory.exists():
        return [], []
    records: list[PluginRecord] = []
    warnings: list[str] = []
    for path in sorted(directory.iterdir()):
        if not path.is_dir():
            continue
        try:
            records.append(load_plugin_record(path, source="builtin", host_version=host_version))
        except CliError as exc:
            warnings.append(f"builtin plugin unavailable: {path.name}: {exc.code}")
    return records, warnings


def discover_project_plugins(cwd: Path, *, host_version: str) -> tuple[list[PluginRecord], list[str]]:
    directory = project_plugin_dir(cwd)
    if not directory.exists():
        return [], []
    records: list[PluginRecord] = []
    warnings: list[str] = []
    for path in sorted(directory.glob("*.json")):
        try:
            record = load_installed_plugin(path, source="project", host_version=host_version)
        except CliError as exc:
            warnings.append(f"plugin record unavailable: {path.name}: {exc.code}")
            continue
        if record.enabled:
            records.append(record)
    return records, warnings


def discover_plugins(cwd: Path, *, host_version: str) -> tuple[list[PluginRecord], list[str]]:
    candidates, warnings = discover_project_plugins(cwd, host_version=host_version)
    builtin, builtin_warnings = discover_builtin_plugins(host_version=host_version)
    candidates.extend(builtin)
    warnings.extend(builtin_warnings)
    by_id: dict[str, list[PluginRecord]] = defaultdict(list)
    for record in candidates:
        by_id[record.id].append(record)

    selected: list[PluginRecord] = []
    for plugin_id, records in by_id.items():
        grouped: dict[int, list[PluginRecord]] = defaultdict(list)
        for record in records:
            grouped[SOURCE_PRIORITY.get(record.source, 99)].append(record)
        best_priority = min(grouped)
        if len(grouped[best_priority]) > 1:
            raise CliError("Duplicate plugins at the same priority", code="PLUGIN_DUPLICATE_ID", details={"id": plugin_id})
        selected_record = grouped[best_priority][0]
        selected.append(selected_record)
        covered = [record for record in records if record is not selected_record]
        for record in covered:
            warnings.append(f"plugin {plugin_id} from {record.source} was covered by {selected_record.source}")

    return sorted(selected, key=lambda item: item.id), warnings


def plugin_summaries(records: list[PluginRecord]) -> list[dict[str, Any]]:
    return [record.summary() for record in sorted(records, key=lambda item: item.id)]


def plugin_catalog_cache_path() -> Path:
    install_override = os.environ.get("INDESIGN_CLI_INSTALL_ROOT")
    if install_override:
        base = Path(install_override).resolve()
    else:
        local_app_data = os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local")
        base = Path(local_app_data) / "indesign-cli"
    return base / "state" / "plugin-catalog-cache.json"


def plugin_cache_fingerprint(record: PluginRecord, *, host_version: str) -> dict[str, Any] | None:
    try:
        manifest_resolved = record.manifest_path.resolve()
        entry_resolved = record.entry_path.resolve()
        manifest_mtime_ns = manifest_resolved.stat().st_mtime_ns
        entry_mtime_ns = entry_resolved.stat().st_mtime_ns
    except OSError:
        return None
    return {
        "plugin_id": record.id,
        "manifest_path": str(manifest_resolved),
        "manifest_mtime_ns": int(manifest_mtime_ns),
        "manifest_version": record.version,
        "entry_mtime_ns": int(entry_mtime_ns),
        "host_version": host_version,
    }


def _plugin_cache_entry_key(fingerprint: dict[str, Any]) -> str:
    manifest_key = os.path.normcase(str(fingerprint["manifest_path"]))
    return f"{fingerprint['plugin_id']}|{manifest_key}"


def _read_plugin_cache_file(cache_path: Path) -> dict[str, Any]:
    try:
        raw = cache_path.read_text(encoding="utf-8")
        payload = json.loads(raw)
    except (OSError, json.JSONDecodeError):
        return {"schema_version": PLUGIN_CATALOG_CACHE_SCHEMA_VERSION, "entries": {}}
    if (
        not isinstance(payload, dict)
        or payload.get("schema_version") != PLUGIN_CATALOG_CACHE_SCHEMA_VERSION
        or not isinstance(payload.get("entries"), dict)
    ):
        return {"schema_version": PLUGIN_CATALOG_CACHE_SCHEMA_VERSION, "entries": {}}
    return payload


def _write_plugin_cache_file(cache_path: Path, payload: dict[str, Any]) -> None:
    tmp_path: Path | None = None
    try:
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = cache_path.parent / f"{cache_path.name}.{os.getpid()}.{uuid.uuid4().hex[:8]}.tmp"
        tmp_path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        os.replace(tmp_path, cache_path)
    except OSError:
        if tmp_path is not None:
            try:
                tmp_path.unlink()
            except OSError:
                pass


def load_plugin_catalog_cache(record: PluginRecord, *, host_version: str) -> dict[str, Any] | None:
    fingerprint = plugin_cache_fingerprint(record, host_version=host_version)
    if fingerprint is None:
        return None
    payload = _read_plugin_cache_file(plugin_catalog_cache_path())
    entry = payload["entries"].get(_plugin_cache_entry_key(fingerprint))
    if not isinstance(entry, dict) or entry.get("fingerprint") != fingerprint:
        return None
    if not isinstance(entry.get("handshake"), dict) or not isinstance(entry.get("tools"), list):
        return None
    return entry


def save_plugin_catalog_cache(
    record: PluginRecord,
    *,
    host_version: str,
    handshake: dict[str, Any],
    tools: list[dict[str, Any]],
    schemas: dict[str, dict[str, Any]] | None = None,
) -> None:
    fingerprint = plugin_cache_fingerprint(record, host_version=host_version)
    if fingerprint is None:
        return
    cache_path = plugin_catalog_cache_path()
    payload = _read_plugin_cache_file(cache_path)
    key = _plugin_cache_entry_key(fingerprint)
    existing = payload["entries"].get(key)
    merged_schemas: dict[str, dict[str, Any]] = {}
    if isinstance(existing, dict) and existing.get("fingerprint") == fingerprint and isinstance(existing.get("schemas"), dict):
        merged_schemas.update(existing["schemas"])
    if isinstance(schemas, dict):
        merged_schemas.update(schemas)
    payload["entries"][key] = {
        "fingerprint": fingerprint,
        "handshake": handshake,
        "tools": tools,
        "schemas": merged_schemas,
    }
    _write_plugin_cache_file(cache_path, payload)


def load_cached_plugin_schema(record: PluginRecord, tool_id: str, *, host_version: str) -> dict[str, Any] | None:
    fingerprint = plugin_cache_fingerprint(record, host_version=host_version)
    if fingerprint is None:
        return None
    payload = _read_plugin_cache_file(plugin_catalog_cache_path())
    entry = payload["entries"].get(_plugin_cache_entry_key(fingerprint))
    if not isinstance(entry, dict) or entry.get("fingerprint") != fingerprint:
        return None
    schemas = entry.get("schemas")
    if not isinstance(schemas, dict):
        return None
    schema = schemas.get(tool_id)
    return dict(schema) if isinstance(schema, dict) else None


def save_cached_plugin_schema(
    record: PluginRecord,
    tool_id: str,
    input_schema: dict[str, Any],
    *,
    host_version: str,
) -> None:
    fingerprint = plugin_cache_fingerprint(record, host_version=host_version)
    if fingerprint is None:
        return
    cache_path = plugin_catalog_cache_path()
    payload = _read_plugin_cache_file(cache_path)
    key = _plugin_cache_entry_key(fingerprint)
    existing = payload["entries"].get(key)
    if isinstance(existing, dict) and existing.get("fingerprint") == fingerprint:
        schemas = existing.get("schemas")
        if not isinstance(schemas, dict):
            schemas = {}
            existing["schemas"] = schemas
        schemas[tool_id] = input_schema
    else:
        payload["entries"][key] = {
            "fingerprint": fingerprint,
            "schemas": {tool_id: input_schema},
        }
    _write_plugin_cache_file(cache_path, payload)
