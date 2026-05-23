from __future__ import annotations

import zipfile
from datetime import datetime
from pathlib import Path
from typing import Any

from .errors import CliError
from .paths import scrub_path


def verify_artifact(path: Path, created_after: datetime | None = None, cwd: Path | None = None) -> dict[str, Any]:
    path_info = scrub_path(str(path), cwd or Path.cwd())
    if not path.exists():
        raise CliError("Artifact not found", code="ARTIFACT_NOT_FOUND", details={"path": path_info})
    stat = path.stat()
    if stat.st_size <= 0:
        raise CliError("Artifact is empty", code="ARTIFACT_EMPTY", details={"path": path_info})
    if created_after and datetime.fromtimestamp(stat.st_mtime, created_after.tzinfo) < created_after:
        raise CliError("Artifact is older than expected", code="ARTIFACT_TOO_OLD", details={"path": path_info})

    suffix = path.suffix.lower()
    if suffix == ".pdf":
        with path.open("rb") as handle:
            if handle.read(4) != b"%PDF":
                raise CliError("PDF signature is invalid", code="ARTIFACT_SIGNATURE_INVALID")
        return {
            "path": path_info,
            "kind": "pdf",
            "size_bytes": stat.st_size,
            "signature_ok": True,
            "mtime": stat.st_mtime,
        }
    if suffix == ".idml":
        try:
            with zipfile.ZipFile(path) as archive:
                if "designmap.xml" not in archive.namelist():
                    raise CliError("IDML designmap.xml missing", code="ARTIFACT_SIGNATURE_INVALID")
        except zipfile.BadZipFile as exc:
            raise CliError("IDML ZIP structure is invalid", code="ARTIFACT_SIGNATURE_INVALID") from exc
        return {
            "path": path_info,
            "kind": "idml",
            "size_bytes": stat.st_size,
            "signature_ok": True,
            "mtime": stat.st_mtime,
        }
    raise CliError(f"Unsupported artifact type: {suffix}", code="ARTIFACT_UNSUPPORTED")
