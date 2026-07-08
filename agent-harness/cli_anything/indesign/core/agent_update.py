from __future__ import annotations

import os
import hashlib
import json
import shutil
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

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
