from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from ..errors import CliError
from .discovery import discover_plugins, plugin_summaries, project_plugin_dir
from .manifest import install_record_for, load_plugin_record


def install_plugin(path_value: str, *, cwd: Path, host_version: str) -> dict[str, Any]:
    record = load_plugin_record(Path(path_value), source="project", host_version=host_version)
    directory = project_plugin_dir(cwd)
    directory.mkdir(parents=True, exist_ok=True)
    target = directory / f"{record.id}.json"
    target.write_text(json.dumps(install_record_for(record), ensure_ascii=False, indent=2), encoding="utf-8")
    return {
        "installed": True,
        "id": record.id,
        "domain": record.domain,
        "version": record.version,
        "record_path": str(target),
        "root": str(record.root),
    }


def remove_plugin(plugin_id: str, *, cwd: Path) -> dict[str, Any]:
    target = project_plugin_dir(cwd) / f"{plugin_id}.json"
    if not target.exists():
        raise CliError(
            "Plugin is not installed in this project",
            code="PLUGIN_NOT_INSTALLED",
            details={"id": plugin_id},
            hint="先运行 `indesign-cli plugin list` 查看已安装插件和确切 id。",
        )
    target.unlink()
    return {"removed": True, "id": plugin_id, "record_path": str(target)}


def list_plugins(*, cwd: Path, host_version: str) -> dict[str, Any]:
    records, warnings = discover_plugins(cwd, host_version=host_version)
    return {"plugins": plugin_summaries(records), "warnings": warnings}
