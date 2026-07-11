from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.request import urlopen

from .errors import CliError


DEFAULT_RUNTIME_SOURCES = (
    r"\\daga-nas5\sa-ai-app\tools\indesign-cli\runtime-latest.json",
    "https://github.com/zhanglongxiao111/indesign-cli/releases/latest/download/runtime-latest.json",
)
_SEMVER = re.compile(r"^\d+\.\d+\.\d+$")
_REQUIRED_COMPONENTS = {"indesign_cli", "html_indesign", "node", "browser"}


@dataclass(frozen=True)
class RuntimeManifest:
    schema_version: int
    name: str
    version: str
    platform: str
    components: dict[str, str]
    artifact_url: str
    github_url: str | None
    sha256: str
    source: str


def parse_version(value: str | None) -> tuple[int, int, int] | None:
    if not value or not _SEMVER.fullmatch(str(value)):
        return None
    major, minor, patch = str(value).split(".")
    return int(major), int(minor), int(patch)


def compare_versions(local: str | None, remote: str) -> int:
    remote_value = parse_version(remote)
    if remote_value is None:
        raise CliError("Runtime manifest version is invalid", code="UPDATE_MANIFEST_INVALID", details={"version": remote})
    local_value = parse_version(local)
    if local_value is None:
        return -1
    return (local_value > remote_value) - (local_value < remote_value)


def parse_runtime_manifest(payload: dict[str, Any], *, source: str) -> RuntimeManifest:
    artifact = payload.get("artifact")
    components = payload.get("components")
    version = str(payload.get("version") or "")
    identity_ok = (
        payload.get("schema_version") == 2
        and payload.get("name") == "indesign-cli-runtime"
        and payload.get("platform") == "windows-x64"
    )
    if not identity_ok or parse_version(version) is None or not isinstance(components, dict) or not isinstance(artifact, dict):
        raise CliError("Runtime manifest is invalid", code="UPDATE_MANIFEST_INVALID", details={"source": source})
    normalized_components = {str(key): str(value) for key, value in components.items() if value is not None}
    if not _REQUIRED_COMPONENTS.issubset(normalized_components) or normalized_components.get("browser") != "msedge":
        raise CliError("Runtime manifest components are invalid", code="UPDATE_MANIFEST_INVALID", details={"source": source})
    url = str(artifact.get("url") or "")
    github_url = str(artifact.get("github_url") or "")
    sha256 = str(artifact.get("sha256") or "").lower()
    if not url or not github_url or not re.fullmatch(r"[0-9a-f]{64}", sha256):
        raise CliError("Runtime artifact is invalid", code="UPDATE_MANIFEST_INVALID", details={"source": source})
    return RuntimeManifest(
        schema_version=2,
        name="indesign-cli-runtime",
        version=version,
        platform="windows-x64",
        components=normalized_components,
        artifact_url=url,
        github_url=github_url,
        sha256=sha256,
        source=source,
    )


def read_runtime_manifest(source: str | Path) -> RuntimeManifest:
    source_text = str(source)
    try:
        if source_text.startswith(("http://", "https://")):
            with urlopen(source_text, timeout=30) as response:
                payload = json.loads(response.read().decode("utf-8-sig"))
        else:
            payload = json.loads(Path(source_text).read_text(encoding="utf-8-sig"))
    except json.JSONDecodeError as exc:
        raise CliError("Runtime manifest is not valid JSON", code="UPDATE_MANIFEST_INVALID", details={"source": source_text}) from exc
    except Exception as exc:
        raise CliError("Cannot read runtime manifest", code="UPDATE_CHECK_FAILED", details={"source": source_text}) from exc
    if not isinstance(payload, dict):
        raise CliError("Runtime manifest must be an object", code="UPDATE_MANIFEST_INVALID", details={"source": source_text})
    return parse_runtime_manifest(payload, source=source_text)


def load_first_runtime_manifest(sources: list[str] | tuple[str, ...] | None = None) -> tuple[RuntimeManifest | None, list[dict[str, str]]]:
    warnings: list[dict[str, str]] = []
    for source in sources or DEFAULT_RUNTIME_SOURCES:
        try:
            return read_runtime_manifest(source), warnings
        except CliError as exc:
            warnings.append({"code": exc.code, "source": str(source), "message": exc.message})
    return None, warnings
