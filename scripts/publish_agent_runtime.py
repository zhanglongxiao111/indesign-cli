"""Publish a built indesign-cli runtime to the company NAS.

The runtime ZIP and Setup are copied first. ``runtime-latest.json`` is
replaced last, so clients never observe a manifest that points at an
incomplete artifact. Every version is also retained under ``releases``.

The same runtime ZIP is then put on the SA-AIAPP agent toolbox shelf: SA
installs it on every start, which is how colleagues' machines actually get
new versions (the launcher's own self-update is blocked inside SA agents).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import sys
import time
import uuid
import zipfile
from pathlib import Path
from typing import Any


DEFAULT_NAS_ROOT = Path(r"\\daga-nas5\sa-ai-app\tools\indesign-cli")
SEMVER = re.compile(r"^\d+\.\d+\.\d+$")
REQUIRED_COMPONENTS = {"indesign_cli", "html_indesign", "node", "winax", "browser"}

# SA-AIAPP 工具箱货架（09 号文档：Agent 基础工具货架唯一声明处）。
DEFAULT_SHELF_ROOT = Path(r"\\daga-nas5\sa-ai-app\tools\agent-toolbox")
# 货架 manifest 的键 = SA 工具箱适配器名；SA 按 SA_AGENT_<键大写> 把入口交给 Agent。两边必须一致。
SHELF_TOOL_NAME = "indesign"
# 工具箱靠 runtime 根目录的这份入口脚本认载荷、拉起 CLI（定义在 cli_anything.indesign.core.bootstrapper）。
RUNTIME_ENTRY_SCRIPT_NAME = "indesign-cli.ps1"


def _read_json(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, json.JSONDecodeError) as exc:
        raise SystemExit(f"Invalid JSON file: {path}") from exc
    if not isinstance(payload, dict):
        raise SystemExit(f"JSON file must contain an object: {path}")
    return payload


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _version_tuple(value: str) -> tuple[int, int, int]:
    if not SEMVER.fullmatch(value):
        raise SystemExit(f"Runtime version is not semantic: {value}")
    return tuple(int(part) for part in value.split("."))  # type: ignore[return-value]


def validate_release(release_dir: Path) -> dict[str, Any]:
    release_dir = release_dir.resolve()
    manifest_path = release_dir / "runtime-latest.json"
    setup_path = release_dir / "indesign-cli-agent-setup.exe"
    manifest = _read_json(manifest_path)
    version = str(manifest.get("version") or "")
    _version_tuple(version)
    components = manifest.get("components")
    artifact = manifest.get("artifact")
    if (
        manifest.get("schema_version") != 2
        or manifest.get("name") != "indesign-cli-runtime"
        or manifest.get("platform") != "windows-x64"
        or not isinstance(components, dict)
        or not isinstance(artifact, dict)
    ):
        raise SystemExit("Runtime manifest identity is invalid")
    normalized_components = {str(key): str(value) for key, value in components.items()}
    if (
        not REQUIRED_COMPONENTS.issubset(normalized_components)
        or normalized_components.get("indesign_cli") != version
        or normalized_components.get("browser") != "msedge"
    ):
        raise SystemExit("Runtime manifest components are invalid")

    archive_name = str(artifact.get("file") or "")
    expected_name = f"runtime-windows-x64-{version}.zip"
    if archive_name != expected_name or Path(archive_name).name != archive_name:
        raise SystemExit("Runtime artifact filename is invalid")
    artifact_url = str(artifact.get("url") or "")
    if not artifact_url.startswith("\\\\") or not artifact_url.endswith(archive_name):
        raise SystemExit(
            "Runtime artifact url must be a UNC path (leading double backslash) ending with the archive name; "
            f"received: {artifact_url}"
        )
    archive_path = release_dir / archive_name
    checksum_path = release_dir / f"{archive_name}.sha256"
    for path in (archive_path, checksum_path, setup_path):
        if not path.is_file():
            raise SystemExit(f"Release artifact is missing: {path}")
    expected_digest = str(artifact.get("sha256") or "").lower()
    actual_digest = _sha256(archive_path)
    if not re.fullmatch(r"[0-9a-f]{64}", expected_digest) or expected_digest != actual_digest:
        raise SystemExit("Runtime ZIP SHA-256 does not match runtime-latest.json")
    checksum_parts = checksum_path.read_text(encoding="utf-8-sig").strip().split()
    if len(checksum_parts) != 2 or checksum_parts != [actual_digest, archive_name]:
        raise SystemExit("Runtime checksum file does not match the ZIP")
    if setup_path.read_bytes()[:2] != b"MZ":
        raise SystemExit("Setup EXE is invalid")

    try:
        with zipfile.ZipFile(archive_path) as payload:
            embedded = json.loads(payload.read("runtime-metadata.json").decode("utf-8-sig"))
    except (OSError, KeyError, zipfile.BadZipFile, json.JSONDecodeError) as exc:
        raise SystemExit("Runtime ZIP metadata is invalid") from exc
    if (
        embedded.get("version") != version
        or embedded.get("components") != components
        or embedded.get("name") != manifest.get("name")
        or embedded.get("platform") != manifest.get("platform")
    ):
        raise SystemExit("Embedded runtime metadata does not match runtime-latest.json")
    if not str(artifact.get("url") or "") or not str(artifact.get("github_url") or ""):
        raise SystemExit("Runtime manifest download URLs are incomplete")
    return {
        "version": version,
        "archive_name": archive_name,
        "checksum_name": checksum_path.name,
        "sha256": actual_digest,
        "components": normalized_components,
    }


def _atomic_copy(source: Path, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.parent / f".{target.name}.tmp-{uuid.uuid4().hex[:8]}"
    try:
        shutil.copy2(source, temporary)
        os.replace(temporary, target)
    finally:
        temporary.unlink(missing_ok=True)


def shelf_archive_name(version: str) -> str:
    return f"indesign-cli-{version}-win-x64.zip"


def publish_to_shelf(
    archive_path: Path,
    *,
    version: str,
    sha256: str,
    shelf_root: Path,
    dry_run: bool = False,
) -> dict[str, Any]:
    """把 runtime ZIP 放上工具箱货架并写入本工具条目。

    与货架既有做法一致：先放归档、复读校验，再备份并原子替换 manifest；其它工具的条目原样保留。
    同一版本同一归档重跑是空操作，方便 NAS 已发布而货架失败时单独重试。
    """
    shelf_root = shelf_root.resolve()
    try:
        with zipfile.ZipFile(archive_path) as payload:
            has_entry_script = RUNTIME_ENTRY_SCRIPT_NAME in payload.namelist()
    except (OSError, zipfile.BadZipFile) as exc:
        raise SystemExit(f"Runtime ZIP is unreadable: {archive_path}") from exc
    if not has_entry_script:
        raise SystemExit(
            f"Runtime ZIP has no {RUNTIME_ENTRY_SCRIPT_NAME} at its root; the SA toolbox could not launch it"
        )
    manifest_path = shelf_root / "manifest.json"
    if not manifest_path.is_file():
        raise SystemExit(f"Toolbox shelf manifest is missing: {manifest_path}")
    shelf = _read_json(manifest_path)
    archive_name = shelf_archive_name(version)
    target = shelf_root / archive_name
    entry = {"version": version, "archive": archive_name, "sha256": sha256}
    current = shelf.get(SHELF_TOOL_NAME)
    current_version = str(current.get("version") or "") if isinstance(current, dict) else None
    plan: dict[str, Any] = {
        "shelf_root": str(shelf_root),
        "tool": SHELF_TOOL_NAME,
        "entry": entry,
        "previous_version": current_version,
    }
    if current == entry and target.is_file() and _sha256(target) == sha256:
        return {**plan, "changed": False}
    if current_version and _version_tuple(version) <= _version_tuple(current_version):
        raise SystemExit(f"Toolbox shelf version must increase: current={current_version}, new={version}")
    plan["changed"] = True
    if dry_run:
        return plan

    if target.is_file():
        if _sha256(target) != sha256:
            raise SystemExit(f"Toolbox shelf already holds a different {archive_name}")
    else:
        _atomic_copy(archive_path, target)
        if _sha256(target) != sha256:
            target.unlink(missing_ok=True)
            raise SystemExit(f"Toolbox shelf copy of {archive_name} does not match its SHA-256")

    backup = shelf_root / f"manifest.json.bak-before-{SHELF_TOOL_NAME}-{version}-{time.strftime('%Y%m%d-%H%M%S')}"
    backup.write_bytes(manifest_path.read_bytes())
    updated = dict(shelf)
    updated[SHELF_TOOL_NAME] = entry
    temporary = shelf_root / f".manifest.json.tmp-{uuid.uuid4().hex[:8]}"
    try:
        # 不带 BOM：SA 装机侧按 JSON.parse 读，BOM 会让整张货架读不出来。
        temporary.write_text(json.dumps(updated, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        os.replace(temporary, manifest_path)
    finally:
        temporary.unlink(missing_ok=True)
    if _read_json(manifest_path).get(SHELF_TOOL_NAME) != entry:
        raise SystemExit("Toolbox shelf manifest did not keep the new entry")
    return {**plan, "backup": str(backup)}


def publish_release(
    release_dir: Path,
    *,
    nas_root: Path = DEFAULT_NAS_ROOT,
    shelf_root: Path | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    release_dir = release_dir.resolve()
    nas_root = nas_root.resolve()
    release = validate_release(release_dir)
    version = release["version"]
    current_manifest_path = nas_root / "runtime-latest.json"
    current = _read_json(current_manifest_path) if current_manifest_path.is_file() else None
    current_version = str(current.get("version") or "") if current else None
    if current_version and _version_tuple(version) <= _version_tuple(current_version):
        raise SystemExit(f"Runtime version must increase: current={current_version}, new={version}")
    archive_target = nas_root / "releases" / version
    if archive_target.exists():
        raise SystemExit(f"Runtime release archive already exists: {archive_target}")

    plan = {
        "version": version,
        "current_version": current_version,
        "release_dir": str(release_dir),
        "nas_root": str(nas_root),
        "archive_to": str(archive_target),
        "components": release["components"],
        "sha256": release["sha256"],
    }
    if shelf_root is not None:
        # 货架的前置检查放在动 NAS 之前：ZIP 缺入口脚本、货架读不到、版本倒退，都在这里就拦下。
        plan["shelf"] = publish_to_shelf(
            release_dir / release["archive_name"],
            version=version,
            sha256=release["sha256"],
            shelf_root=shelf_root,
            dry_run=True,
        )
    if dry_run:
        return {"ok": True, "dry_run": True, "plan": plan}

    nas_root.mkdir(parents=True, exist_ok=True)
    archive_target.parent.mkdir(parents=True, exist_ok=True)
    staging = nas_root / f".{version}.staging-{uuid.uuid4().hex[:8]}"
    old_manifest_bytes = current_manifest_path.read_bytes() if current_manifest_path.is_file() else None
    old_archive_name = str((current or {}).get("artifact", {}).get("file") or "")
    manifest_switched = False
    try:
        shutil.copytree(release_dir, staging)
        validate_release(staging)
        os.replace(staging, archive_target)

        for name in (
            release["archive_name"],
            release["checksum_name"],
            "indesign-cli-agent-setup.exe",
        ):
            _atomic_copy(archive_target / name, nas_root / name)
        _atomic_copy(archive_target / "runtime-latest.json", current_manifest_path)
        manifest_switched = True

        if old_archive_name and old_archive_name != release["archive_name"]:
            (nas_root / old_archive_name).unlink(missing_ok=True)
            (nas_root / f"{old_archive_name}.sha256").unlink(missing_ok=True)

        verified = validate_release(nas_root)
    except BaseException:
        shutil.rmtree(staging, ignore_errors=True)
        if manifest_switched:
            if old_manifest_bytes is None:
                current_manifest_path.unlink(missing_ok=True)
            else:
                rollback = nas_root / f".runtime-latest.rollback-{uuid.uuid4().hex[:8]}"
                rollback.write_bytes(old_manifest_bytes)
                os.replace(rollback, current_manifest_path)
            if current_version:
                old_release = nas_root / "releases" / current_version
                for old_name in (
                    old_archive_name,
                    f"{old_archive_name}.sha256" if old_archive_name else "",
                    "indesign-cli-agent-setup.exe",
                ):
                    old_file = old_release / old_name if old_name else None
                    if old_file and old_file.is_file():
                        _atomic_copy(old_file, nas_root / old_name)
        if release["archive_name"] != old_archive_name:
            (nas_root / release["archive_name"]).unlink(missing_ok=True)
            (nas_root / release["checksum_name"]).unlink(missing_ok=True)
        if archive_target.exists():
            shutil.rmtree(archive_target, ignore_errors=True)
        raise

    result: dict[str, Any] = {
        "ok": True,
        "dry_run": False,
        "plan": plan,
        "verify": {
            "version": verified["version"],
            "sha256_match": verified["sha256"] == release["sha256"],
            "archive_exists": archive_target.is_dir(),
        },
    }
    if shelf_root is not None:
        # 货架是独立的第二条分发路：它失败不回滚已经完好发布的 NAS 版本，只说清怎么单独补上。
        try:
            result["shelf"] = publish_to_shelf(
                archive_target / release["archive_name"],
                version=version,
                sha256=release["sha256"],
                shelf_root=shelf_root,
            )
        except SystemExit as exc:
            raise SystemExit(
                f"NAS runtime {version} 已发布；SA 工具箱货架同步失败：{exc}。"
                "修好后用 --shelf-only 单独重试这一步。"
            ) from exc
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Publish an indesign-cli runtime release to the company NAS")
    parser.add_argument("--release-dir", required=True, help="Built release directory")
    parser.add_argument("--nas-root", default=str(DEFAULT_NAS_ROOT), help="Company NAS indesign-cli directory")
    parser.add_argument("--dry-run", action="store_true", help="Validate and print the publication plan only")
    parser.add_argument("--shelf-root", default=str(DEFAULT_SHELF_ROOT), help="SA-AIAPP agent toolbox shelf directory")
    parser.add_argument(
        "--shelf-only",
        action="store_true",
        help="Only sync this release onto the toolbox shelf (retry after the NAS step already succeeded)",
    )
    args = parser.parse_args(argv)
    if args.shelf_only:
        release_dir = Path(args.release_dir).resolve()
        release = validate_release(release_dir)
        payload = {
            "ok": True,
            "dry_run": args.dry_run,
            "shelf": publish_to_shelf(
                release_dir / release["archive_name"],
                version=release["version"],
                sha256=release["sha256"],
                shelf_root=Path(args.shelf_root),
                dry_run=args.dry_run,
            ),
        }
    else:
        payload = publish_release(
            Path(args.release_dir),
            nas_root=Path(args.nas_root),
            shelf_root=Path(args.shelf_root),
            dry_run=args.dry_run,
        )
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
