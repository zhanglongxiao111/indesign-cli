from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import time
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable
from urllib.request import urlopen

from .errors import CliError
from .catalog import Catalog, plugin_tool_entries
from .plugins.backend import PluginBackend
from .plugins.manifest import load_plugin_record
from .plugins.validate import _schema_errors, _tool_errors
from .runtime_health import probe_edge
from .runtime_manifest import RuntimeManifest, compare_versions, load_first_runtime_manifest, parse_runtime_manifest, parse_version, read_runtime_manifest


@dataclass(frozen=True)
class RuntimeLayout:
    root: Path

    @property
    def bin(self) -> Path:
        return self.root / "bin"

    @property
    def runtime(self) -> Path:
        return self.root / "runtime"

    @property
    def state(self) -> Path:
        return self.root / "state"

    @property
    def tmp(self) -> Path:
        return self.root / "tmp"

    @property
    def current_state(self) -> Path:
        return self.state / "current-runtime.json"

    @property
    def update_lock(self) -> Path:
        return self.state / "runtime-update.lock"

    def create(self) -> None:
        for path in (self.bin, self.runtime, self.state, self.tmp):
            path.mkdir(parents=True, exist_ok=True)


@dataclass(frozen=True)
class RuntimeInstallResult:
    runtime_root: Path
    installed: bool
    warnings: tuple[dict[str, str], ...] = ()


class RuntimeUpdateLock:
    def __init__(self, path: Path, *, timeout_seconds: float = 30.0) -> None:
        self.path = path
        self.timeout_seconds = timeout_seconds
        self._handle = None

    @staticmethod
    def _try_lock(handle) -> None:
        handle.seek(0)
        if os.name == "nt":
            import msvcrt

            msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl

            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)

    @staticmethod
    def _unlock(handle) -> None:
        handle.seek(0)
        if os.name == "nt":
            import msvcrt

            msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
        else:
            import fcntl

            fcntl.flock(handle.fileno(), fcntl.LOCK_UN)

    def __enter__(self) -> "RuntimeUpdateLock":
        self.path.parent.mkdir(parents=True, exist_ok=True)
        try:
            with self.path.open("xb") as initializer:
                initializer.write(b"\0")
        except (FileExistsError, PermissionError):
            if not self.path.exists():
                raise
        handle = self.path.open("r+b")
        start = time.monotonic()
        while True:
            try:
                self._try_lock(handle)
                self._handle = handle
                handle.seek(0)
                handle.truncate()
                handle.write(json.dumps({"pid": os.getpid(), "started_at": time.time()}).encode("utf-8"))
                handle.flush()
                return self
            except OSError as exc:
                if time.monotonic() - start >= self.timeout_seconds:
                    handle.close()
                    raise CliError("Timed out waiting for runtime update lock", code="UPDATE_LOCK_TIMEOUT", details={"lock": str(self.path)}) from exc
                time.sleep(0.1)

    def __exit__(self, exc_type, exc, tb) -> None:
        if self._handle is not None:
            try:
                self._unlock(self._handle)
            finally:
                self._handle.close()
                self._handle = None


def read_current_runtime(root: Path) -> dict[str, Any] | None:
    path = RuntimeLayout(root).current_state
    if not path.exists():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8-sig"))
    except OSError as exc:
        raise CliError("Current runtime state cannot be read", code="RUNTIME_STATE_INVALID", details={"path": str(path), "reason": "STATE_UNREADABLE"}) from exc
    except json.JSONDecodeError as exc:
        raise CliError("Current runtime state is not valid JSON", code="RUNTIME_STATE_INVALID", details={"path": str(path), "reason": "STATE_JSON_INVALID"}) from exc
    if not isinstance(payload, dict):
        raise CliError("Current runtime state must be an object", code="RUNTIME_STATE_INVALID", details={"path": str(path), "reason": "STATE_NOT_OBJECT"})
    if payload.get("schema_version") != 1:
        raise CliError("Current runtime state schema is unsupported", code="RUNTIME_STATE_INVALID", details={"path": str(path), "reason": "STATE_SCHEMA_UNSUPPORTED"})
    version = str(payload.get("version") or "")
    if parse_version(version) is None:
        raise CliError("Current runtime state version is invalid", code="RUNTIME_STATE_INVALID", details={"path": str(path), "reason": "STATE_VERSION_INVALID"})
    components = payload.get("components")
    required = {"indesign_cli", "html_indesign", "node", "winax", "browser"}
    if (
        not isinstance(components, dict)
        or not required.issubset(components)
        or not all(isinstance(components.get(key), str) and components.get(key) for key in required)
        or components.get("browser") != "msedge"
        or components.get("indesign_cli") != version
    ):
        raise CliError("Current runtime state components are invalid", code="RUNTIME_STATE_INVALID", details={"path": str(path), "reason": "STATE_COMPONENTS_INVALID"})
    expected = (root / "runtime" / version).resolve()
    root_value = payload.get("root")
    if not isinstance(root_value, str) or os.path.normcase(str(Path(root_value).resolve())) != os.path.normcase(str(expected)):
        raise CliError(
            "Current runtime state root does not match its version directory",
            code="RUNTIME_STATE_INVALID",
            details={"path": str(path), "reason": "STATE_ROOT_MISMATCH", "expected": str(expected), "actual": root_value},
        )
    if not expected.is_dir():
        raise CliError("Current runtime root is missing", code="RUNTIME_STATE_INVALID", details={"path": str(path), "reason": "STATE_ROOT_MISSING", "root": str(expected)})
    normalized = dict(payload)
    normalized["root"] = str(expected)
    normalized["components"] = {str(key): str(value) for key, value in components.items()}
    return normalized


def current_runtime_root(root: Path) -> Path | None:
    state = read_current_runtime(root)
    if not state or not state.get("root"):
        return None
    candidate = Path(str(state["root"]))
    return candidate if candidate.is_dir() else None


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _copy_url(source: str, target: Path) -> None:
    try:
        if source.startswith(("http://", "https://")):
            with urlopen(source, timeout=60) as response, target.open("wb") as output:
                shutil.copyfileobj(response, output)
        else:
            shutil.copy2(Path(source), target)
    except Exception as exc:
        target.unlink(missing_ok=True)
        raise CliError("Cannot download runtime artifact", code="UPDATE_ARTIFACT_NOT_FOUND", details={"source": source}) from exc


def _download(manifest: RuntimeManifest, target: Path) -> str:
    target.parent.mkdir(parents=True, exist_ok=True)
    last_error: CliError | None = None
    integrity_error: CliError | None = None
    for source in [manifest.artifact_url, manifest.github_url]:
        if not source:
            continue
        target.unlink(missing_ok=True)
        try:
            _copy_url(source, target)
            actual = _sha256(target)
            if actual.lower() != manifest.sha256.lower():
                raise CliError("Runtime artifact sha256 mismatch", code="UPDATE_SHA256_MISMATCH", details={"expected": manifest.sha256, "actual": actual, "source": source})
            return source
        except CliError as exc:
            target.unlink(missing_ok=True)
            last_error = exc
            if exc.code == "UPDATE_SHA256_MISMATCH":
                integrity_error = exc
    if integrity_error:
        raise integrity_error
    if last_error:
        raise last_error
    raise CliError("Runtime manifest has no artifact source", code="UPDATE_MANIFEST_INVALID")


def _safe_extract(archive: Path, target: Path) -> None:
    try:
        with zipfile.ZipFile(archive) as payload:
            target_resolved = target.resolve()
            for member in payload.infolist():
                destination = (target / member.filename).resolve()
                try:
                    destination.relative_to(target_resolved)
                except ValueError as exc:
                    raise CliError("Runtime archive contains unsafe path", code="RUNTIME_ARCHIVE_UNSAFE", details={"member": member.filename}) from exc
            payload.extractall(target)
    except CliError:
        raise
    except (zipfile.BadZipFile, OSError) as exc:
        raise CliError("Runtime archive is invalid", code="RUNTIME_ARCHIVE_INVALID") from exc


def _read_json_object(path: Path, *, code: str) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, json.JSONDecodeError) as exc:
        raise CliError("Runtime JSON file is invalid", code=code, details={"path": str(path), "reason": "JSON_INVALID"}) from exc
    if not isinstance(payload, dict):
        raise CliError("Runtime JSON file must contain an object", code=code, details={"path": str(path), "reason": "NOT_OBJECT"})
    return payload


def _require_pe(path: Path) -> None:
    try:
        signature = path.read_bytes()[:2]
    except OSError as exc:
        raise CliError("Runtime executable cannot be read", code="RUNTIME_EXECUTABLE_INVALID", details={"path": str(path)}) from exc
    if signature != b"MZ":
        raise CliError("Runtime executable is not a Windows PE file", code="RUNTIME_EXECUTABLE_INVALID", details={"path": str(path)})


def _run_probe(probe_runner: Callable[..., Any], args: list[str], *, cwd: Path, probe: str) -> dict[str, Any]:
    try:
        result = probe_runner(
            args,
            cwd=cwd,
            text=True,
            encoding="utf-8",
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=20,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise CliError("Runtime health probe could not execute", code="RUNTIME_PROBE_FAILED", details={"probe": probe, "reason": exc.__class__.__name__}) from exc
    if result.returncode != 0:
        raise CliError(
            "Runtime health probe failed",
            code="RUNTIME_PROBE_FAILED",
            details={"probe": probe, "returncode": result.returncode, "stderr": str(result.stderr or "")[-500:]},
        )
    return {"probe": probe, "stdout": str(result.stdout or "").strip()}


OFFICIAL_HTML_TOOLS = {
    "html.authoring_lint",
    "html.compile_instructions",
    "html.build_indesign",
    "html.reverse_export",
}


def _cli_version(stdout: str) -> str | None:
    try:
        payload = json.loads(stdout)
    except json.JSONDecodeError:
        return stdout.strip() or None
    if not isinstance(payload, dict):
        return None
    data = payload.get("data")
    return str(data.get("version")) if isinstance(data, dict) and data.get("version") else None


def _require_component_version(component: str, actual: str | None, expected: str) -> None:
    normalized = actual[1:] if component == "node" and actual and actual.startswith("v") else actual
    if normalized != expected:
        raise CliError(
            "Runtime component version does not match its manifest",
            code="RUNTIME_COMPONENT_VERSION_MISMATCH",
            details={"component": component, "expected": expected, "actual": normalized},
        )


def validate_builtin_plugin(
    runtime_root: Path,
    *,
    components: dict[str, str],
    probe_runner: Callable[..., Any] = subprocess.run,
) -> dict[str, Any]:
    plugin_root = runtime_root / "plugins" / "html-indesign"
    record = load_plugin_record(plugin_root, source="builtin", host_version=components["indesign_cli"])
    expected_version = components["html_indesign"]
    if record.id != "html-indesign" or record.domain != "html" or record.version != expected_version:
        raise CliError(
            "Builtin HTML plugin identity does not match runtime components",
            code="BUILTIN_PLUGIN_IDENTITY_INVALID",
            details={
                "expected": {"id": "html-indesign", "domain": "html", "version": expected_version},
                "actual": {"id": record.id, "domain": record.domain, "version": record.version},
            },
        )
    node = runtime_root / "node" / "node.exe"
    backend = PluginBackend(record, node_executable=str(node), runner=probe_runner)
    handshake = backend.handshake({"name": "indesign-cli", "version": components["indesign_cli"], "protocol": record.manifest["protocol"]})
    if (
        handshake.get("id") != record.id
        or handshake.get("version") != record.version
        or handshake.get("domain") != record.domain
        or handshake.get("protocol") != record.manifest["protocol"]
    ):
        raise CliError("Builtin plugin handshake identity is invalid", code="BUILTIN_PLUGIN_IDENTITY_INVALID", details={"handshake": handshake})
    tools = backend.list_tools()
    contract_errors: list[dict[str, Any]] = []
    schemas: dict[str, dict[str, Any]] = {}
    for tool in tools:
        contract_errors.extend(_tool_errors(record, tool))
        tool_id = tool.get("id")
        if tool_id in OFFICIAL_HTML_TOOLS:
            if tool.get("callable") is not True:
                contract_errors.append(
                    {"code": "PLUGIN_TOOL_INVALID", "message": "Official runtime tool must be callable", "details": {"tool_id": tool_id}}
                )
            try:
                schema_payload = backend.schema(tool_id)
            except CliError as exc:
                contract_errors.append({"code": exc.code, "message": exc.message, "details": {"tool_id": tool_id, **exc.details}})
            else:
                contract_errors.extend(_schema_errors(tool, schema_payload))
                if isinstance(schema_payload.get("inputSchema"), dict):
                    schemas[tool_id] = schema_payload["inputSchema"]
    if contract_errors:
        raise CliError(
            "Builtin HTML plugin tool contracts are invalid",
            code="BUILTIN_PLUGIN_TOOLS_INVALID",
            details={"errors": contract_errors},
        )
    entries = plugin_tool_entries(record, tools)
    catalog = Catalog(
        repo_root=runtime_root,
        tools=entries,
        domains={"html": str(record.manifest.get("description") or "HTML tools")},
        schemas=schemas,
        plugin_records={record.id: record},
    )
    discovered = {tool["id"] for tool in catalog.list_tools(domain="html", source="plugin")}
    if discovered != OFFICIAL_HTML_TOOLS:
        raise CliError(
            "Builtin HTML plugin tools do not match the official catalog",
            code="BUILTIN_PLUGIN_TOOLS_INVALID",
            details={"expected": sorted(OFFICIAL_HTML_TOOLS), "actual": sorted(discovered)},
        )
    for tool_id in OFFICIAL_HTML_TOOLS:
        catalog.schema(tool_id)
    return {"record": record, "tools": sorted(discovered)}


def validate_runtime(
    runtime_root: Path,
    *,
    components: dict[str, str],
    edge_probe: Callable[[], dict[str, Any]] = probe_edge,
    probe_runner: Callable[..., Any] = subprocess.run,
) -> dict[str, Any]:
    required = [
        runtime_root / "cli" / "indesign-cli.exe",
        runtime_root / "cli" / "_internal" / "cli_anything" / "indesign" / "node" / "internal_tool_bridge.mjs",
        runtime_root / "node" / "node.exe",
        runtime_root / "server" / "package.json",
        runtime_root / "server" / "src" / "index.js",
        runtime_root / "server" / "src" / "advanced" / "index.js",
        runtime_root / "server" / "node_modules" / "winax" / "package.json",
        runtime_root / "plugins" / "html-indesign" / "manifest.json",
    ]
    missing = [str(path.relative_to(runtime_root)) for path in required if not path.is_file()]
    if missing:
        raise CliError("Runtime is incomplete", code="RUNTIME_VALIDATION_FAILED", details={"missing": missing})
    cli = runtime_root / "cli" / "indesign-cli.exe"
    node = runtime_root / "node" / "node.exe"
    _require_pe(cli)
    _require_pe(node)
    _read_json_object(runtime_root / "server" / "package.json", code="RUNTIME_VALIDATION_FAILED")
    winax_package = _read_json_object(runtime_root / "server" / "node_modules" / "winax" / "package.json", code="WINAX_INVALID")
    winax_root = runtime_root / "server" / "node_modules" / "winax"
    if not any(winax_root.rglob("*.node")):
        raise CliError("winax native binding is missing", code="WINAX_INVALID", details={"path": str(winax_root)})
    probes = [
        _run_probe(probe_runner, [str(cli), "--version"], cwd=runtime_root, probe="cli"),
        _run_probe(probe_runner, [str(node), "--version"], cwd=runtime_root, probe="node"),
        _run_probe(probe_runner, [str(node), "-e", "require('winax'); process.stdout.write('ok')"], cwd=runtime_root / "server", probe="winax"),
    ]
    _require_component_version("indesign_cli", _cli_version(probes[0]["stdout"]), components["indesign_cli"])
    _require_component_version("node", probes[1]["stdout"], components["node"])
    _require_component_version("winax", str(winax_package.get("version") or "") or None, components["winax"])
    plugin = validate_builtin_plugin(runtime_root, components=components, probe_runner=probe_runner)
    edge = edge_probe()
    if edge.get("available") is not True:
        raise CliError("Microsoft Edge is not available", code="EDGE_NOT_AVAILABLE", details=edge)
    return {"edge": edge, "probes": probes, "plugin_tools": plugin["tools"]}


def _write_current_state(layout: RuntimeLayout, payload: dict[str, Any]) -> None:
    temporary = layout.current_state.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(temporary, layout.current_state)


def _remove_runtime_path(path: Path) -> None:
    if path.is_dir():
        shutil.rmtree(path)
    else:
        path.unlink(missing_ok=True)


def _cleanup_other_runtimes(layout: RuntimeLayout, keep: Path) -> tuple[dict[str, str], ...]:
    warnings: list[dict[str, str]] = []
    for candidate in layout.runtime.iterdir():
        if candidate != keep:
            try:
                _remove_runtime_path(candidate)
            except OSError as exc:
                warnings.append({"code": "RUNTIME_CLEANUP_FAILED", "path": str(candidate), "message": str(exc)})
    return tuple(warnings)


def _commit_staged_runtime(
    layout: RuntimeLayout,
    *,
    staging: Path,
    target: Path,
    state_payload: dict[str, Any],
) -> RuntimeInstallResult:
    target_installed = False
    try:
        if target.exists():
            _remove_runtime_path(target)
        os.replace(staging, target)
        target_installed = True
        _write_current_state(layout, state_payload)
    except Exception:
        if target_installed:
            shutil.rmtree(target, ignore_errors=True)
        raise
    warnings = _cleanup_other_runtimes(layout, target)
    return RuntimeInstallResult(runtime_root=target, installed=True, warnings=warnings)


def install_runtime(
    manifest_source: str | Path | RuntimeManifest,
    *,
    root: Path,
    validator: Callable[..., Any] = validate_runtime,
    edge_probe: Callable[[], dict[str, Any]] = probe_edge,
    probe_runner: Callable[..., Any] = subprocess.run,
) -> RuntimeInstallResult:
    manifest = manifest_source if isinstance(manifest_source, RuntimeManifest) else read_runtime_manifest(manifest_source)
    layout = RuntimeLayout(root)
    layout.create()
    archive = layout.tmp / f"runtime-{manifest.version}-{os.getpid()}.zip"
    staging = layout.runtime / f".staging-{manifest.version}-{os.getpid()}"
    target = layout.runtime / manifest.version
    with RuntimeUpdateLock(layout.update_lock):
        previous = current_runtime_root(root)
        if previous is not None and target.resolve() == previous.resolve():
            validator(previous, components=manifest.components, edge_probe=edge_probe, probe_runner=probe_runner)
            warnings = _cleanup_other_runtimes(layout, previous)
            return RuntimeInstallResult(runtime_root=previous, installed=False, warnings=warnings)
        shutil.rmtree(staging, ignore_errors=True)
        try:
            artifact_source = _download(manifest, archive)
            staging.mkdir(parents=True)
            _safe_extract(archive, staging)
            validator(staging, components=manifest.components, edge_probe=edge_probe, probe_runner=probe_runner)
            return _commit_staged_runtime(
                layout,
                staging=staging,
                target=target,
                state_payload={
                    "schema_version": 1,
                    "version": manifest.version,
                    "root": str(target),
                    "components": manifest.components,
                    "manifest_source": manifest.source,
                    "artifact_source": artifact_source,
                },
            )
        finally:
            archive.unlink(missing_ok=True)
            shutil.rmtree(staging, ignore_errors=True)


def install_embedded_runtime(
    embedded_root: Path,
    *,
    root: Path,
    validator: Callable[..., Any] = validate_runtime,
    edge_probe: Callable[[], dict[str, Any]] = probe_edge,
    probe_runner: Callable[..., Any] = subprocess.run,
) -> RuntimeInstallResult:
    """Seed the persistent layout from setup-owned files; never run from them."""
    metadata_path = embedded_root / "runtime-metadata.json"
    try:
        metadata = json.loads(metadata_path.read_text(encoding="utf-8-sig"))
        if not isinstance(metadata, dict):
            raise CliError("Embedded runtime metadata must be an object", code="UPDATE_MANIFEST_INVALID")
        manifest = parse_runtime_manifest(metadata, source=str(metadata_path))
    except (OSError, json.JSONDecodeError, CliError) as exc:
        reason = exc.code if isinstance(exc, CliError) else exc.__class__.__name__
        raise CliError(
            "Embedded runtime metadata is invalid",
            code="EMBEDDED_RUNTIME_METADATA_INVALID",
            details={"path": str(metadata_path), "reason": reason},
        ) from exc
    version = manifest.version
    layout = RuntimeLayout(root)
    layout.create()
    staging = layout.runtime / f".staging-{version}-{os.getpid()}"
    target = layout.runtime / version
    with RuntimeUpdateLock(layout.update_lock):
        existing = current_runtime_root(root)
        if existing is not None and existing.resolve() == target.resolve():
            validator(existing, components=manifest.components, edge_probe=edge_probe, probe_runner=probe_runner)
            warnings = _cleanup_other_runtimes(layout, existing)
            return RuntimeInstallResult(runtime_root=existing, installed=False, warnings=warnings)
        try:
            shutil.copytree(embedded_root, staging)
            validator(staging, components=manifest.components, edge_probe=edge_probe, probe_runner=probe_runner)
            return _commit_staged_runtime(
                layout,
                staging=staging,
                target=target,
                state_payload={
                    "schema_version": 1,
                    "version": version,
                    "root": str(target),
                    "components": manifest.components,
                    "manifest_source": "embedded-setup",
                    "artifact_source": str(embedded_root),
                },
            )
        finally:
            shutil.rmtree(staging, ignore_errors=True)


def ensure_runtime_ready(*, root: Path, sources: list[str] | tuple[str, ...] | None = None, command_args: list[str] | None = None) -> dict[str, Any]:
    state = read_current_runtime(root)
    current = current_runtime_root(root)
    manifest, warnings = load_first_runtime_manifest(sources)
    if manifest is None:
        if current:
            return {"updated": False, "version": state.get("version"), "runtime_root": str(current), "warnings": warnings, "command_args": command_args or []}
        raise CliError("Cannot install initial runtime", code="INITIAL_INSTALL_FAILED", details={"sources": list(sources or []), "warnings": warnings})
    current_version = str((state or {}).get("version") or "") or None
    if current and compare_versions(current_version, manifest.version) > 0:
        return {"updated": False, "version": current_version, "runtime_root": str(current), "source": manifest.source, "warnings": warnings, "command_args": command_args or []}
    try:
        installed = install_runtime(manifest, root=root)
    except CliError as exc:
        if current:
            warnings.append({"code": exc.code, "source": manifest.source, "message": exc.message})
            return {"updated": False, "version": current_version, "latest": manifest.version, "runtime_root": str(current), "warnings": warnings, "command_args": command_args or []}
        raise CliError("Cannot install initial runtime", code="INITIAL_INSTALL_FAILED", details={"reason": exc.code, "reason_details": exc.details}) from exc
    warnings.extend(installed.warnings)
    return {"updated": installed.installed, "version": manifest.version, "previous_version": current_version, "runtime_root": str(installed.runtime_root), "source": manifest.source, "warnings": warnings, "command_args": command_args or []}
