from __future__ import annotations

import os
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
