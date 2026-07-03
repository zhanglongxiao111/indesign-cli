from __future__ import annotations

import hashlib
import json
import os
import shutil
import sys
from pathlib import Path
from typing import Any

from .errors import CliError


def default_install_root() -> Path:
    base = os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local")
    return Path(base) / "indesign-cli"


def read_json(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8-sig"))
    except OSError as exc:
        raise CliError(
            "Cannot read release manifest",
            code="UPDATE_CHECK_FAILED",
            details={"source": str(path)},
            next_action="Verify network share permissions and rerun the command.",
        ) from exc
    except json.JSONDecodeError as exc:
        raise CliError(
            "Release manifest is not valid JSON",
            code="UPDATE_CHECK_FAILED",
            details={"source": str(path), "position": f"line {exc.lineno} column {exc.colno}"},
            next_action="Fix latest.json and rerun the command.",
        ) from exc
    if not isinstance(payload, dict):
        raise CliError(
            "Release manifest must be a JSON object",
            code="UPDATE_CHECK_FAILED",
            details={"source": str(path)},
            next_action="Fix latest.json and rerun the command.",
        )
    return payload


def write_json_atomic(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


def current_manifest_path(install_root: Path) -> Path:
    return install_root / "current" / "manifest.json"


def current_manifest(install_root: Path) -> dict[str, Any] | None:
    path = current_manifest_path(install_root)
    if not path.exists():
        return None
    return read_json(path)


def version_key(version: str | None) -> tuple[int, ...]:
    if not version:
        return ()
    parts: list[int] = []
    for part in str(version).split("."):
        digits = "".join(ch for ch in part if ch.isdigit())
        parts.append(int(digits or 0))
    return tuple(parts)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def build_runtime_env(runtime_root: Path, *, base_env: dict[str, str] | None = None) -> dict[str, str]:
    runtime_root = runtime_root.resolve()
    node = runtime_root / "node" / ("node.exe" if os.name == "nt" else "node")
    server = runtime_root / "server"
    expected = [node, server / "package.json", server / "src" / "index.js", server / "src" / "advanced" / "index.js"]
    missing = [str(path) for path in expected if not path.exists()]
    if missing:
        raise CliError(
            "Runtime is incomplete",
            code="RUNTIME_INVALID",
            details={"runtime_root": str(runtime_root), "missing": missing},
            next_action="Run indesign-cli-agent update again.",
        )
    env = dict(base_env if base_env is not None else os.environ)
    env["INDESIGN_CLI_RUNTIME_ROOT"] = str(runtime_root)
    env["INDESIGN_CLI_NODE"] = str(node)
    env["INDESIGN_CLI_SERVER_ROOT"] = str(server)
    return env


def latest_manifest(source: str | Path) -> dict[str, Any]:
    return read_json(Path(source))


def update_needed(current: dict[str, Any] | None, latest: dict[str, Any]) -> bool:
    return version_key(str(latest.get("version") or "")) > version_key(str((current or {}).get("version") or ""))


def _copy_runtime_from_manifest(latest: dict[str, Any], install_root: Path) -> Path:
    runtime_dir = latest.get("runtime_dir")
    if runtime_dir:
        source = Path(str(runtime_dir))
    else:
        source = embedded_runtime_root()
    if source is None:
        raise CliError(
            "Release manifest does not provide an unpacked runtime and no embedded runtime is available",
            code="RELEASE_RUNTIME_UNSUPPORTED",
            details={"version": latest.get("version")},
            next_action="Publish a bootstrapper with embedded runtime, or provide runtime_dir in latest.json.",
        )
    if not source.exists():
        raise CliError(
            "Release runtime_dir does not exist",
            code="RELEASE_RUNTIME_NOT_FOUND",
            details={"runtime_dir": str(source)},
            next_action="Fix latest.json and rerun update.",
        )
    target = install_root / "runtime" / str(latest["version"])
    if target.exists():
        shutil.rmtree(target)
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(source, target)
    return target


def embedded_runtime_root() -> Path | None:
    override = os.environ.get("INDESIGN_CLI_EMBEDDED_RUNTIME_ROOT")
    if override:
        return Path(override)
    frozen_root = getattr(sys, "_MEIPASS", None)
    if frozen_root:
        candidate = Path(str(frozen_root)) / "runtime"
        if candidate.exists():
            return candidate
    return None


def perform_update(install_root: Path, latest: dict[str, Any], current: dict[str, Any] | None = None) -> dict[str, Any]:
    version = str(latest.get("version") or "")
    if not version:
        raise CliError("Release manifest is missing version", code="UPDATE_CHECK_FAILED")

    url = latest.get("url")
    sha256 = latest.get("sha256")
    if url and sha256:
        artifact = Path(str(url))
        try:
            actual = sha256_file(artifact)
        except OSError as exc:
            raise CliError(
                "Cannot read release artifact",
                code="RELEASE_ARTIFACT_NOT_FOUND",
                details={"url": str(url)},
                next_action="Check latest.json url and network share permissions.",
            ) from exc
        if actual.lower() != str(sha256).lower():
            raise CliError(
                "Release artifact sha256 mismatch",
                code="RELEASE_SHA256_MISMATCH",
                details={"url": str(url), "expected": str(sha256), "actual": actual},
                next_action="Regenerate sha256.txt/latest.json and rerun update.",
            )

    runtime_root = _copy_runtime_from_manifest(latest, install_root)
    build_runtime_env(runtime_root)
    manifest = {
        "version": version,
        "runtime_root": str(runtime_root),
        "previous_version": (current or {}).get("version"),
    }
    write_json_atomic(current_manifest_path(install_root), manifest)
    return {"updated": True, "version": version, "runtime_root": str(runtime_root), "previous_version": manifest["previous_version"]}


def ensure_updated(install_root: Path, source: str | Path) -> dict[str, Any]:
    latest = latest_manifest(source)
    current = current_manifest(install_root)
    if not update_needed(current, latest):
        runtime_root = (current or {}).get("runtime_root")
        return {
            "updated": False,
            "version": (current or {}).get("version"),
            "runtime_root": runtime_root,
            "current": (current or {}).get("version"),
            "latest": latest.get("version"),
        }
    try:
        payload = perform_update(install_root, latest, current=current)
    except CliError as exc:
        raise CliError(
            "A newer indesign-cli version is required, but update failed.",
            code="UPDATE_REQUIRED_BUT_FAILED",
            details={
                "source": str(source),
                "current": (current or {}).get("version"),
                "latest": latest.get("version"),
                "reason": exc.code,
                "reason_details": exc.details,
            },
            next_action=exc.next_action or "Fix the release and rerun update.",
        ) from exc
    payload["current"] = (current or {}).get("version")
    payload["latest"] = latest.get("version")
    return payload
