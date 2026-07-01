from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from ..errors import CliError
from .host_actions import ALLOWED_HOST_ACTIONS


PLUGIN_PROTOCOL = "indesign-cli-plugin.v1"
PLUGIN_SCHEMA_VERSION = 1
SUPPORTED_KINDS = {"node-plugin"}
ID_PATTERN = re.compile(r"^[a-z][a-z0-9-]{2,63}$")
DOMAIN_PATTERN = re.compile(r"^[a-z][a-z0-9_]{1,31}$")
TOOL_ID_PATTERN = re.compile(r"^[a-z][a-z0-9_]{1,31}\.[a-z][a-z0-9_]*$")
CORE_DOMAINS = {
    "template",
    "document",
    "page",
    "spread",
    "master",
    "layer",
    "object",
    "text",
    "graphics",
    "style",
    "export",
    "book",
    "presentation",
    "script",
    "session",
    "server",
    "skill",
    "utility",
}

REQUIRED_MANIFEST_FIELDS = {
    "schema_version",
    "protocol",
    "id",
    "name",
    "version",
    "kind",
    "domain",
    "entry",
    "description",
    "timeout_default_ms",
    "document_state_policy",
    "host_actions",
    "requires",
    "capabilities",
    "permissions",
}


@dataclass(frozen=True)
class PluginRecord:
    id: str
    source: str
    root: Path
    manifest_path: Path
    manifest: dict[str, Any]
    install_record_path: Path | None = None
    enabled: bool = True

    @property
    def domain(self) -> str:
        return str(self.manifest["domain"])

    @property
    def version(self) -> str:
        return str(self.manifest["version"])

    @property
    def entry_path(self) -> Path:
        return (self.root / str(self.manifest["entry"])).resolve()

    def summary(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "domain": self.domain,
            "version": self.version,
            "source": self.source,
            "enabled": self.enabled,
            "root": str(self.root),
            "manifest": str(self.manifest_path),
        }


def read_json(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8-sig"))
    except FileNotFoundError as exc:
        raise CliError("Plugin manifest not found", code="PLUGIN_MANIFEST_NOT_FOUND", details={"path": str(path)}) from exc
    except json.JSONDecodeError as exc:
        raise CliError("Plugin manifest must be valid JSON", code="PLUGIN_MANIFEST_JSON_INVALID", details={"path": str(path)}) from exc
    if not isinstance(payload, dict):
        raise CliError("Plugin manifest must be a JSON object", code="PLUGIN_MANIFEST_INVALID", details={"path": str(path)})
    return payload


def default_manifest_path(root: Path) -> Path:
    preferred = root / "src" / "indesign-cli-plugin" / "manifest.json"
    if preferred.exists():
        return preferred
    return root / "manifest.json"


def resolve_manifest_input(path_or_manifest: Path) -> tuple[Path, Path, dict[str, Any]]:
    path = path_or_manifest.resolve()
    if path.is_dir():
        root = path
        manifest_path = default_manifest_path(root).resolve()
    else:
        manifest_path = path
        if manifest_path.parent.name == "indesign-cli-plugin" and manifest_path.parent.parent.name == "src":
            root = manifest_path.parent.parent.parent
        else:
            root = manifest_path.parent
    manifest = read_json(manifest_path)
    return root, manifest_path, manifest


def resolve_install_record(record_path: Path) -> tuple[Path, Path, dict[str, Any], dict[str, Any]]:
    record = read_json(record_path)
    root_value = record.get("root")
    if not isinstance(root_value, str) or not root_value:
        raise CliError("Plugin install record requires root", code="PLUGIN_INSTALL_RECORD_INVALID", details={"path": str(record_path)})
    root = Path(root_value).resolve()
    manifest_relative = record.get("manifest") or "src/indesign-cli-plugin/manifest.json"
    manifest_path = (root / str(manifest_relative)).resolve()
    if not manifest_path.exists() and (root / "manifest.json").exists():
        manifest_path = (root / "manifest.json").resolve()
    manifest = read_json(manifest_path)
    return root, manifest_path, manifest, record


def _version_tuple(value: str) -> tuple[int, int, int]:
    parts = value.split(".")
    if len(parts) < 3:
        raise ValueError(value)
    return tuple(int(part) for part in parts[:3])


def version_satisfies(version: str, requirement: str | None) -> bool:
    if not requirement:
        return True
    requirement = requirement.strip()
    if requirement.startswith(">="):
        try:
            return _version_tuple(version) >= _version_tuple(requirement[2:].strip())
        except ValueError:
            return False
    return version == requirement


def validate_manifest(
    *,
    manifest: dict[str, Any],
    root: Path,
    manifest_path: Path,
    host_version: str,
    allow_core_domain: bool = False,
) -> list[dict[str, Any]]:
    errors: list[dict[str, Any]] = []

    missing = sorted(field for field in REQUIRED_MANIFEST_FIELDS if field not in manifest)
    for field in missing:
        errors.append({"code": "PLUGIN_MANIFEST_INVALID", "message": f"Missing manifest field: {field}", "details": {"field": field}})

    if errors:
        return errors

    if manifest.get("schema_version") != PLUGIN_SCHEMA_VERSION:
        errors.append({"code": "PLUGIN_MANIFEST_INVALID", "message": "Unsupported plugin schema_version", "details": {"schema_version": manifest.get("schema_version")}})
    if manifest.get("protocol") != PLUGIN_PROTOCOL:
        errors.append({"code": "PLUGIN_PROTOCOL_UNSUPPORTED", "message": "Unsupported plugin protocol", "details": {"protocol": manifest.get("protocol")}})
    if manifest.get("kind") not in SUPPORTED_KINDS:
        errors.append({"code": "PLUGIN_MANIFEST_INVALID", "message": "Unsupported plugin kind", "details": {"kind": manifest.get("kind")}})

    plugin_id = manifest.get("id")
    if not isinstance(plugin_id, str) or not ID_PATTERN.match(plugin_id):
        errors.append({"code": "PLUGIN_MANIFEST_INVALID", "message": "Invalid plugin id", "details": {"id": plugin_id}})

    domain = manifest.get("domain")
    if not isinstance(domain, str) or not DOMAIN_PATTERN.match(domain):
        errors.append({"code": "PLUGIN_MANIFEST_INVALID", "message": "Invalid plugin domain", "details": {"domain": domain}})
    elif domain in CORE_DOMAINS and not allow_core_domain:
        errors.append({"code": "PLUGIN_MANIFEST_INVALID", "message": "Plugin domain conflicts with core domain", "details": {"domain": domain}})

    version = manifest.get("version")
    if not isinstance(version, str):
        errors.append({"code": "PLUGIN_MANIFEST_INVALID", "message": "Plugin version must be a string", "details": {"version": version}})
    else:
        try:
            _version_tuple(version)
        except ValueError:
            errors.append({"code": "PLUGIN_MANIFEST_INVALID", "message": "Plugin version must be SemVer-like", "details": {"version": version}})

    entry = manifest.get("entry")
    if not isinstance(entry, str) or not entry:
        errors.append({"code": "PLUGIN_ENTRY_NOT_FOUND", "message": "Plugin entry is required", "details": {"entry": entry}})
    else:
        entry_path = (root / entry).resolve()
        try:
            entry_path.relative_to(root.resolve())
        except ValueError:
            errors.append({"code": "PLUGIN_ENTRY_NOT_FOUND", "message": "Plugin entry must stay inside plugin root", "details": {"entry": entry}})
        if not entry_path.exists():
            errors.append({"code": "PLUGIN_ENTRY_NOT_FOUND", "message": "Plugin entry file not found", "details": {"entry": str(entry_path)}})

    permissions = manifest.get("permissions")
    if not isinstance(permissions, dict) or permissions.get("indesign") != "host_only":
        errors.append({"code": "PLUGIN_MANIFEST_INVALID", "message": "permissions.indesign must be host_only", "details": {"permissions": permissions}})

    timeout_default_ms = manifest.get("timeout_default_ms")
    if not isinstance(timeout_default_ms, int) or timeout_default_ms < 1 or timeout_default_ms > 3_600_000:
        errors.append({"code": "PLUGIN_MANIFEST_INVALID", "message": "timeout_default_ms must be between 1 and 3600000", "details": {"field": "timeout_default_ms"}})

    if manifest.get("document_state_policy") not in {"host_reported", "plugin_reported", "none"}:
        errors.append({"code": "PLUGIN_MANIFEST_INVALID", "message": "document_state_policy is required", "details": {"field": "document_state_policy"}})

    host_actions = manifest.get("host_actions")
    if not isinstance(host_actions, list) or not all(isinstance(action, str) for action in host_actions):
        errors.append({"code": "PLUGIN_MANIFEST_INVALID", "message": "host_actions must be an array of strings", "details": {"field": "host_actions"}})
    else:
        for action in host_actions:
            if action not in ALLOWED_HOST_ACTIONS:
                errors.append(
                    {
                        "code": "PLUGIN_HOST_ACTION_DENIED",
                        "message": f"Unsupported host action: {action}",
                        "details": {"field": "host_actions", "action": action, "allowed": sorted(ALLOWED_HOST_ACTIONS)},
                    }
                )

    requires = manifest.get("requires")
    if not isinstance(requires, dict):
        errors.append({"code": "PLUGIN_MANIFEST_INVALID", "message": "requires must be an object", "details": {"requires": requires}})
    elif not version_satisfies(host_version, requires.get("indesign_cli")):
        errors.append(
            {
                "code": "PLUGIN_PROTOCOL_UNSUPPORTED",
                "message": "Plugin requires a different indesign-cli version",
                "details": {"requires": requires.get("indesign_cli"), "host_version": host_version},
            }
        )

    if not isinstance(manifest.get("capabilities"), dict):
        errors.append({"code": "PLUGIN_MANIFEST_INVALID", "message": "capabilities must be an object", "details": {"capabilities": manifest.get("capabilities")}})

    return errors


def load_plugin_record(path_or_manifest: Path, *, source: str, host_version: str) -> PluginRecord:
    root, manifest_path, manifest = resolve_manifest_input(path_or_manifest)
    errors = validate_manifest(manifest=manifest, root=root, manifest_path=manifest_path, host_version=host_version)
    if errors:
        first = errors[0]
        raise CliError(first["message"], code=first["code"], details={"errors": errors, "manifest": str(manifest_path)})
    return PluginRecord(
        id=str(manifest["id"]),
        source=source,
        root=root,
        manifest_path=manifest_path,
        manifest=manifest,
        enabled=True,
    )


def load_installed_plugin(record_path: Path, *, source: str, host_version: str) -> PluginRecord:
    root, manifest_path, manifest, record = resolve_install_record(record_path)
    enabled = bool(record.get("enabled", True))
    errors = validate_manifest(manifest=manifest, root=root, manifest_path=manifest_path, host_version=host_version)
    if errors:
        first = errors[0]
        raise CliError(first["message"], code=first["code"], details={"errors": errors, "record": str(record_path)})
    return PluginRecord(
        id=str(manifest["id"]),
        source=source,
        root=root,
        manifest_path=manifest_path,
        manifest=manifest,
        install_record_path=record_path,
        enabled=enabled,
    )


def install_record_for(record: PluginRecord) -> dict[str, Any]:
    try:
        manifest_relative = record.manifest_path.relative_to(record.root)
    except ValueError:
        manifest_relative = record.manifest_path
    return {
        "schema_version": 1,
        "id": record.id,
        "kind": record.manifest["kind"],
        "root": str(record.root),
        "manifest": str(manifest_relative).replace("\\", "/"),
        "enabled": True,
    }
