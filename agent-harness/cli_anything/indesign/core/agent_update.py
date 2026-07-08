from __future__ import annotations

import os
import hashlib
import json
import shutil
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.request import urlopen

from .errors import CliError


DEFAULT_SOURCES = (
    r"\\daga-nas5\sa-ai-app\tools\indesign-cli\latest.json",
    "https://github.com/zhanglongxiao111/indesign-cli/releases/latest/download/latest.json",
)


@dataclass(frozen=True)
class Manifest:
    version: str
    artifact_url: str
    github_url: str | None
    sha256: str
    source: str


def install_root() -> Path:
    base = os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local")
    return Path(base) / "indesign-cli"


def bin_dir(root: Path | None = None) -> Path:
    return (root or install_root()) / "bin"


def agent_exe_path(root: Path | None = None) -> Path:
    return bin_dir(root) / "indesign-cli-agent.exe"


def tmp_dir(root: Path | None = None) -> Path:
    return (root or install_root()) / "tmp"


def state_dir(root: Path | None = None) -> Path:
    return (root or install_root()) / "state"


def update_state_path(root: Path | None = None) -> Path:
    return state_dir(root) / "update-state.json"


def read_update_state(root: Path | None = None) -> dict[str, Any] | None:
    path = update_state_path(root)
    if not path.exists():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, json.JSONDecodeError):
        return None
    return payload if isinstance(payload, dict) else None


def parse_version(value: str | None) -> tuple[int, int, int] | None:
    if not value:
        return None
    parts = str(value).split(".")
    if len(parts) != 3:
        return None
    parsed: list[int] = []
    for part in parts:
        if not part.isdigit():
            return None
        parsed.append(int(part))
    return (parsed[0], parsed[1], parsed[2])


def compare_versions(local: str | None, remote: str) -> int:
    remote_key = parse_version(remote)
    if remote_key is None:
        raise CliError(
            "Remote indesign-cli-agent version is not valid SemVer",
            code="UPDATE_MANIFEST_INVALID",
            details={"version": remote},
        )
    local_key = parse_version(local)
    if local_key is None:
        return -1
    if local_key < remote_key:
        return -1
    if local_key > remote_key:
        return 1
    return 0


def parse_manifest(payload: dict[str, Any], *, source: str) -> Manifest:
    artifact = payload.get("artifact")
    if not isinstance(artifact, dict):
        raise CliError("Release manifest is missing artifact", code="UPDATE_MANIFEST_INVALID", details={"source": source})
    version = str(payload.get("version") or "")
    if parse_version(version) is None:
        raise CliError("Release manifest version is invalid", code="UPDATE_MANIFEST_INVALID", details={"source": source, "version": version})
    artifact_url = str(artifact.get("url") or "")
    sha256 = str(artifact.get("sha256") or "")
    if not artifact_url or len(sha256) != 64:
        raise CliError("Release manifest artifact is invalid", code="UPDATE_MANIFEST_INVALID", details={"source": source})
    github_url = artifact.get("github_url")
    return Manifest(
        version=version,
        artifact_url=artifact_url,
        github_url=str(github_url) if github_url else None,
        sha256=sha256,
        source=source,
    )


def read_manifest_file(path: Path) -> Manifest:
    try:
        payload = json.loads(path.read_text(encoding="utf-8-sig"))
    except OSError as exc:
        raise CliError(
            "Cannot read release manifest",
            code="UPDATE_CHECK_FAILED",
            details={"source": str(path)},
        ) from exc
    except json.JSONDecodeError as exc:
        raise CliError(
            "Release manifest is not valid JSON",
            code="UPDATE_MANIFEST_INVALID",
            details={"source": str(path), "position": f"line {exc.lineno} column {exc.colno}"},
        ) from exc
    if not isinstance(payload, dict):
        raise CliError("Release manifest must be a JSON object", code="UPDATE_MANIFEST_INVALID", details={"source": str(path)})
    return parse_manifest(payload, source=str(path))


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def copy_artifact(source_url: str, target: Path, *, expected_sha256: str) -> Path:
    if source_url.startswith(("http://", "https://")):
        return copy_http_artifact(source_url, target, expected_sha256=expected_sha256)
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        target.unlink()
    source = Path(source_url)
    try:
        shutil.copy2(source, target)
        actual = sha256_file(target)
    except OSError as exc:
        if target.exists():
            target.unlink()
        raise CliError(
            "Cannot copy indesign-cli-agent artifact",
            code="UPDATE_ARTIFACT_NOT_FOUND",
            details={"source": source_url, "target": str(target)},
        ) from exc
    if actual.lower() != expected_sha256.lower():
        target.unlink(missing_ok=True)
        raise CliError(
            "indesign-cli-agent artifact sha256 mismatch",
            code="UPDATE_SHA256_MISMATCH",
            details={"source": source_url, "expected": expected_sha256, "actual": actual},
        )
    return target


def read_http_json(url: str) -> dict[str, Any]:
    try:
        with urlopen(url, timeout=30) as response:
            payload = json.loads(response.read().decode("utf-8-sig"))
    except Exception as exc:
        raise CliError("Cannot read HTTP release manifest", code="UPDATE_CHECK_FAILED", details={"source": url}) from exc
    if not isinstance(payload, dict):
        raise CliError("HTTP release manifest must be a JSON object", code="UPDATE_MANIFEST_INVALID", details={"source": url})
    return payload


def copy_http_artifact(url: str, target: Path, *, expected_sha256: str) -> Path:
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        target.unlink()
    try:
        with urlopen(url, timeout=60) as response:
            target.write_bytes(response.read())
    except Exception as exc:
        target.unlink(missing_ok=True)
        raise CliError("Cannot download indesign-cli-agent artifact", code="UPDATE_ARTIFACT_NOT_FOUND", details={"source": url}) from exc
    actual = sha256_file(target)
    if actual.lower() != expected_sha256.lower():
        target.unlink(missing_ok=True)
        raise CliError(
            "indesign-cli-agent artifact sha256 mismatch",
            code="UPDATE_SHA256_MISMATCH",
            details={"source": url, "expected": expected_sha256, "actual": actual},
        )
    return target


def copy_manifest_artifact(manifest: Manifest, target: Path) -> str:
    sources = [manifest.artifact_url]
    if manifest.github_url and manifest.github_url not in sources:
        sources.append(manifest.github_url)
    last_error: CliError | None = None
    for source in sources:
        try:
            copy_artifact(source, target, expected_sha256=manifest.sha256)
            return source
        except CliError as exc:
            last_error = exc
            target.unlink(missing_ok=True)
    if last_error is not None:
        raise last_error
    raise CliError(
        "Release manifest artifact is invalid",
        code="UPDATE_MANIFEST_INVALID",
        details={"source": manifest.source},
    )


class UserUpdateLock:
    def __init__(self, path: Path, *, timeout_seconds: float = 30.0) -> None:
        self.path = path
        self.timeout_seconds = timeout_seconds
        self._fd: int | None = None

    def __enter__(self) -> "UserUpdateLock":
        self.path.parent.mkdir(parents=True, exist_ok=True)
        start = time.monotonic()
        while True:
            try:
                self._fd = os.open(str(self.path), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
                os.write(self._fd, json.dumps({"pid": os.getpid(), "start_time": time.time()}).encode("utf-8"))
                return self
            except FileExistsError as exc:
                if time.monotonic() - start >= self.timeout_seconds:
                    raise CliError(
                        "Timed out waiting for indesign-cli-agent update lock",
                        code="UPDATE_LOCK_TIMEOUT",
                        details={"lock": str(self.path)},
                    ) from exc
                time.sleep(0.1)

    def __exit__(self, exc_type, exc, tb) -> None:
        if self._fd is not None:
            os.close(self._fd)
            self._fd = None
        try:
            self.path.unlink()
        except FileNotFoundError:
            pass


def write_update_state(root: Path, payload: dict[str, Any]) -> None:
    path = update_state_path(root)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, path)


def install_or_replace_exe(manifest: Manifest, *, root: Path | None = None) -> Path:
    actual_root = root or install_root()
    target = agent_exe_path(actual_root)
    temp_download = tmp_dir(actual_root) / f"{os.getpid()}.download"
    staged = target.with_name(f".{target.name}.{os.getpid()}.new")
    lock = state_dir(actual_root) / "update.lock"
    with UserUpdateLock(lock):
        artifact_source = copy_manifest_artifact(manifest, temp_download)
        target.parent.mkdir(parents=True, exist_ok=True)
        if staged.exists():
            staged.unlink()
        shutil.move(str(temp_download), str(staged))
        try:
            try:
                os.replace(staged, target)
            except OSError as exc:
                raise CliError(
                    "Cannot replace indesign-cli-agent executable",
                    code="UPDATE_REPLACE_FAILED",
                    details={"target": str(target), "reason": str(exc)},
                ) from exc
        finally:
            temp_download.unlink(missing_ok=True)
            staged.unlink(missing_ok=True)
        write_update_state(
            actual_root,
            {
                "status": "updated",
                "version": manifest.version,
                "source": manifest.source,
                "artifact_source": artifact_source,
                "target": str(target),
            },
        )
    return target


def load_first_manifest(sources: list[str] | tuple[str, ...] | None = None) -> tuple[Manifest | None, list[dict[str, Any]]]:
    warnings: list[dict[str, Any]] = []
    for source in sources or DEFAULT_SOURCES:
        try:
            if str(source).startswith(("http://", "https://")):
                return parse_manifest(read_http_json(str(source)), source=str(source)), warnings
            return read_manifest_file(Path(source)), warnings
        except CliError as exc:
            warnings.append({"code": exc.code, "source": source, "message": exc.message})
    return None, warnings


def ensure_agent_ready(*, command_args: list[str], sources: list[str] | None = None) -> dict[str, Any]:
    root = install_root()
    exe = agent_exe_path(root)
    manifest, warnings = load_first_manifest(sources)
    if manifest is None:
        if exe.exists():
            return {"updated": False, "version": None, "warnings": warnings, "command_args": command_args}
        raise CliError(
            "Cannot install indesign-cli-agent because no update source is available",
            code="INITIAL_INSTALL_FAILED",
            details={"sources": list(sources or DEFAULT_SOURCES), "warnings": warnings},
        )
    if not exe.exists():
        try:
            install_or_replace_exe(manifest, root=root)
        except CliError as exc:
            raise CliError(
                "Cannot install indesign-cli-agent",
                code="INITIAL_INSTALL_FAILED",
                details={"source": manifest.source, "reason": exc.code, "reason_details": exc.details},
            ) from exc
        return {
            "updated": True,
            "version": manifest.version,
            "source": manifest.source,
            "warnings": warnings,
            "command_args": command_args,
        }
    state = read_update_state(root)
    current_version = str((state or {}).get("version") or "") or None
    if compare_versions(current_version, manifest.version) < 0:
        try:
            install_or_replace_exe(manifest, root=root)
        except CliError as exc:
            warnings.append({"code": exc.code, "source": manifest.source, "message": exc.message})
            return {
                "updated": False,
                "version": current_version,
                "latest": manifest.version,
                "source": manifest.source,
                "warnings": warnings,
                "command_args": command_args,
            }
        return {
            "updated": True,
            "version": manifest.version,
            "source": manifest.source,
            "previous_version": current_version,
            "warnings": warnings,
            "command_args": command_args,
        }
    return {
        "updated": False,
        "version": manifest.version,
        "source": manifest.source,
        "current_version": current_version,
        "warnings": warnings,
        "command_args": command_args,
    }


def _path_entries(current_path: str) -> list[str]:
    return [entry.strip().rstrip("\\/") for entry in current_path.split(os.pathsep) if entry.strip()]


def path_needs_registration(bin_path: str, *, current_path: str | None = None) -> bool:
    current = current_path if current_path is not None else os.environ.get("PATH", "")
    normalized = str(Path(bin_path)).rstrip("\\/")
    return normalized.lower() not in {entry.lower() for entry in _path_entries(current)}


def updated_user_path(bin_path: str, *, current_path: str | None = None) -> str:
    current = current_path if current_path is not None else os.environ.get("PATH", "")
    if not path_needs_registration(bin_path, current_path=current):
        return current
    return f"{current}{os.pathsep if current else ''}{bin_path}"


def read_user_path() -> str:
    if os.name != "nt":
        return os.environ.get("PATH", "")
    import winreg

    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, "Environment", 0, winreg.KEY_READ) as key:
            for name in ("Path", "PATH"):
                try:
                    value, _ = winreg.QueryValueEx(key, name)
                    return str(value)
                except FileNotFoundError:
                    continue
    except FileNotFoundError:
        return ""
    return ""


def write_user_path(value: str) -> None:
    if os.name != "nt":
        os.environ["PATH"] = value
        return
    import winreg

    with winreg.CreateKey(winreg.HKEY_CURRENT_USER, "Environment") as key:
        winreg.SetValueEx(key, "Path", 0, winreg.REG_EXPAND_SZ, value)


def register_user_command(root: Path | None = None) -> dict[str, Any]:
    actual_root = root or install_root()
    directory = str(bin_dir(actual_root))
    current_user_path = read_user_path()
    new_user_path = updated_user_path(directory, current_path=current_user_path)
    if new_user_path == current_user_path:
        return {"registered": False, "bin": directory}
    write_user_path(new_user_path)
    os.environ["PATH"] = updated_user_path(directory, current_path=os.environ.get("PATH", ""))
    return {"registered": True, "bin": directory}
