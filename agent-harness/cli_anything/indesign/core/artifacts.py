from __future__ import annotations

import zipfile
from datetime import datetime
from pathlib import Path
import re
from typing import Any

from .errors import CliError
from .paths import scrub_path


def parse_timestamp(value: str) -> datetime:
    normalized = value.strip()
    if normalized.endswith("Z"):
        normalized = normalized[:-1] + "+00:00"
    normalized = re.sub(r"(\.\d{6})\d+([+-]\d{2}:\d{2})$", r"\1\2", normalized)
    return datetime.fromisoformat(normalized)


def verify_artifact(path: Path, created_after: datetime | None = None, cwd: Path | None = None) -> dict[str, Any]:
    path_info = scrub_path(str(path), cwd or Path.cwd())
    if not path.exists():
        raise CliError(
            "Artifact not found",
            code="ARTIFACT_NOT_FOUND",
            details={"path": path_info},
            hint="先确认导出命令是否成功；相对路径按当前工作目录解析，必要时用绝对输出路径再运行 `indesign-cli export verify <path>`。",
        )
    stat = path.stat()
    if stat.st_size <= 0:
        raise CliError(
            "Artifact is empty",
            code="ARTIFACT_EMPTY",
            details={"path": path_info},
            hint="产物存在但为空；重新导出后再验证，或检查 InDesign 导出错误。",
        )
    if created_after and datetime.fromtimestamp(stat.st_mtime, created_after.tzinfo) < created_after:
        raise CliError(
            "Artifact is older than expected",
            code="ARTIFACT_TOO_OLD",
            details={"path": path_info},
            hint="当前文件早于 created_after；重新导出，或确认验证路径没有指向旧产物。",
        )

    # mtime 保留 epoch 兼容旧消费方；mtime_iso 与 created_after 的 ISO 输入对称
    mtime_iso = datetime.fromtimestamp(stat.st_mtime).astimezone().isoformat()
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
            "mtime_iso": mtime_iso,
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
            "mtime_iso": mtime_iso,
        }
    raise CliError(
        f"Unsupported artifact type: {suffix}",
        code="ARTIFACT_UNSUPPORTED",
        hint="当前只验证 PDF 和 IDML；图片等产物请先检查文件存在、大小和导出日志。",
    )
