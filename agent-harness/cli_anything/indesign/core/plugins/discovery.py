from __future__ import annotations

from collections import defaultdict
from pathlib import Path
from typing import Any

from ..errors import CliError
from .manifest import PluginRecord, load_installed_plugin


SOURCE_PRIORITY = {
    "project": 1,
    "user": 2,
    "entry_point": 3,
    "builtin": 4,
}


def project_plugin_dir(cwd: Path) -> Path:
    return cwd / ".indesign-cli" / "plugins"


def user_plugin_dir(home: Path | None = None) -> Path:
    base = home or Path.home()
    return base / ".indesign-cli" / "plugins"


def discover_project_plugins(cwd: Path, *, host_version: str) -> tuple[list[PluginRecord], list[str]]:
    directory = project_plugin_dir(cwd)
    if not directory.exists():
        return [], []
    records: list[PluginRecord] = []
    warnings: list[str] = []
    for path in sorted(directory.glob("*.json")):
        try:
            record = load_installed_plugin(path, source="project", host_version=host_version)
        except CliError as exc:
            warnings.append(f"plugin record unavailable: {path.name}: {exc.code}")
            continue
        if record.enabled:
            records.append(record)
    return records, warnings


def discover_plugins(cwd: Path, *, host_version: str) -> tuple[list[PluginRecord], list[str]]:
    candidates, warnings = discover_project_plugins(cwd, host_version=host_version)
    by_id: dict[str, list[PluginRecord]] = defaultdict(list)
    for record in candidates:
        by_id[record.id].append(record)

    selected: list[PluginRecord] = []
    for plugin_id, records in by_id.items():
        grouped: dict[int, list[PluginRecord]] = defaultdict(list)
        for record in records:
            grouped[SOURCE_PRIORITY.get(record.source, 99)].append(record)
        best_priority = min(grouped)
        if len(grouped[best_priority]) > 1:
            raise CliError("Duplicate plugins at the same priority", code="PLUGIN_DUPLICATE_ID", details={"id": plugin_id})
        selected_record = grouped[best_priority][0]
        selected.append(selected_record)
        covered = [record for record in records if record is not selected_record]
        for record in covered:
            warnings.append(f"plugin {plugin_id} from {record.source} was covered by {selected_record.source}")

    return sorted(selected, key=lambda item: item.id), warnings


def plugin_summaries(records: list[PluginRecord]) -> list[dict[str, Any]]:
    return [record.summary() for record in sorted(records, key=lambda item: item.id)]
