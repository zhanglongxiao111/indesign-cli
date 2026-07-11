from __future__ import annotations

import hashlib
import json
import os
import shutil
import time
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable
from urllib.request import urlopen

from .errors import CliError
from .runtime_health import probe_edge
from .runtime_manifest import RuntimeManifest, compare_versions, load_first_runtime_manifest, read_runtime_manifest


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


class RuntimeUpdateLock:
    def __init__(self, path: Path, *, timeout_seconds: float = 30.0) -> None:
        self.path = path
        self.timeout_seconds = timeout_seconds
        self._fd: int | None = None

    def __enter__(self) -> "RuntimeUpdateLock":
        self.path.parent.mkdir(parents=True, exist_ok=True)
        start = time.monotonic()
        while True:
            try:
                self._fd = os.open(str(self.path), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
                os.write(self._fd, json.dumps({"pid": os.getpid(), "started_at": time.time()}).encode("utf-8"))
                return self
            except FileExistsError as exc:
                if time.monotonic() - start >= self.timeout_seconds:
                    raise CliError("Timed out waiting for runtime update lock", code="UPDATE_LOCK_TIMEOUT", details={"lock": str(self.path)}) from exc
                time.sleep(0.1)

    def __exit__(self, exc_type, exc, tb) -> None:
        if self._fd is not None:
            os.close(self._fd)
            self._fd = None
        self.path.unlink(missing_ok=True)


def read_current_runtime(root: Path) -> dict[str, Any] | None:
    path = RuntimeLayout(root).current_state
    try:
        payload = json.loads(path.read_text(encoding="utf-8-sig"))
    except (FileNotFoundError, OSError, json.JSONDecodeError):
        return None
    return payload if isinstance(payload, dict) else None


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


def validate_runtime(runtime_root: Path, *, edge_probe: Callable[[], dict[str, Any]] = probe_edge) -> dict[str, Any]:
    required = [
        runtime_root / "cli" / "indesign-cli.exe",
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
    edge = edge_probe()
    if edge.get("available") is not True:
        raise CliError("Microsoft Edge is not available", code="EDGE_NOT_AVAILABLE", details=edge)
    return {"edge": edge}


def _write_current_state(layout: RuntimeLayout, payload: dict[str, Any]) -> None:
    temporary = layout.current_state.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(temporary, layout.current_state)


def _cleanup_other_runtimes(layout: RuntimeLayout, keep: Path) -> None:
    for candidate in layout.runtime.iterdir():
        if candidate != keep:
            shutil.rmtree(candidate, ignore_errors=True) if candidate.is_dir() else candidate.unlink(missing_ok=True)


def install_runtime(
    manifest_source: str | Path | RuntimeManifest,
    *,
    root: Path,
    validator: Callable[..., Any] = validate_runtime,
    edge_probe: Callable[[], dict[str, Any]] = probe_edge,
) -> Path:
    manifest = manifest_source if isinstance(manifest_source, RuntimeManifest) else read_runtime_manifest(manifest_source)
    layout = RuntimeLayout(root)
    layout.create()
    archive = layout.tmp / f"runtime-{manifest.version}-{os.getpid()}.zip"
    staging = layout.runtime / f".staging-{manifest.version}-{os.getpid()}"
    target = layout.runtime / manifest.version
    previous = current_runtime_root(root)
    with RuntimeUpdateLock(layout.update_lock):
        if previous is not None and target.resolve() == previous.resolve():
            raise CliError(
                "Current runtime cannot be overwritten in place",
                code="RUNTIME_IN_USE",
                details={"runtime_root": str(previous)},
            )
        shutil.rmtree(staging, ignore_errors=True)
        target_installed = False
        try:
            artifact_source = _download(manifest, archive)
            staging.mkdir(parents=True)
            _safe_extract(archive, staging)
            validator(staging, edge_probe=edge_probe)
            if target.exists():
                shutil.rmtree(target)
            os.replace(staging, target)
            target_installed = True
            _write_current_state(
                layout,
                {
                    "schema_version": 1,
                    "version": manifest.version,
                    "root": str(target),
                    "components": manifest.components,
                    "manifest_source": manifest.source,
                    "artifact_source": artifact_source,
                },
            )
            _cleanup_other_runtimes(layout, target)
            return target
        except Exception:
            if target_installed:
                shutil.rmtree(target, ignore_errors=True)
            raise
        finally:
            archive.unlink(missing_ok=True)
            shutil.rmtree(staging, ignore_errors=True)


def install_embedded_runtime(
    embedded_root: Path,
    *,
    root: Path,
    validator: Callable[..., Any] = validate_runtime,
    edge_probe: Callable[[], dict[str, Any]] = probe_edge,
) -> Path:
    """Seed the persistent layout from setup-owned files; never run from them."""
    existing = current_runtime_root(root)
    if existing:
        return existing
    metadata_path = embedded_root / "runtime-metadata.json"
    try:
        metadata = json.loads(metadata_path.read_text(encoding="utf-8-sig"))
    except (OSError, json.JSONDecodeError) as exc:
        raise CliError("Embedded runtime metadata is invalid", code="INITIAL_INSTALL_FAILED", details={"path": str(metadata_path)}) from exc
    version = str(metadata.get("version") or "") if isinstance(metadata, dict) else ""
    components = metadata.get("components") if isinstance(metadata, dict) else None
    if not version or not isinstance(components, dict):
        raise CliError("Embedded runtime metadata is incomplete", code="INITIAL_INSTALL_FAILED", details={"path": str(metadata_path)})
    layout = RuntimeLayout(root)
    layout.create()
    staging = layout.runtime / f".staging-{version}-{os.getpid()}"
    target = layout.runtime / version
    with RuntimeUpdateLock(layout.update_lock):
        try:
            shutil.copytree(embedded_root, staging)
            validator(staging, edge_probe=edge_probe)
            if target.exists():
                shutil.rmtree(target)
            os.replace(staging, target)
            _write_current_state(
                layout,
                {
                    "schema_version": 1,
                    "version": version,
                    "root": str(target),
                    "components": {str(key): str(value) for key, value in components.items()},
                    "manifest_source": "embedded-setup",
                    "artifact_source": str(embedded_root),
                },
            )
            _cleanup_other_runtimes(layout, target)
            return target
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
    if current and compare_versions(current_version, manifest.version) >= 0:
        return {"updated": False, "version": current_version, "runtime_root": str(current), "source": manifest.source, "warnings": warnings, "command_args": command_args or []}
    try:
        installed = install_runtime(manifest, root=root)
    except CliError as exc:
        if current:
            warnings.append({"code": exc.code, "source": manifest.source, "message": exc.message})
            return {"updated": False, "version": current_version, "latest": manifest.version, "runtime_root": str(current), "warnings": warnings, "command_args": command_args or []}
        raise CliError("Cannot install initial runtime", code="INITIAL_INSTALL_FAILED", details={"reason": exc.code, "reason_details": exc.details}) from exc
    return {"updated": True, "version": manifest.version, "previous_version": current_version, "runtime_root": str(installed), "source": manifest.source, "warnings": warnings, "command_args": command_args or []}
