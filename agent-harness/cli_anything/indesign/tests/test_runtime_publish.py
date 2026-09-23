from __future__ import annotations

import hashlib
import importlib.util
import json
import zipfile
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[4]
SCRIPT_PATH = REPO_ROOT / "scripts" / "publish_agent_runtime.py"


def _load_publisher():
    spec = importlib.util.spec_from_file_location("publish_agent_runtime", SCRIPT_PATH)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _write_release(
    root: Path,
    version: str,
    plugin_version: str,
    *,
    corrupt_checksum: bool = False,
    artifact_url: str | None = None,
    entry_script: bool = True,
) -> Path:
    root.mkdir(parents=True, exist_ok=True)
    archive_name = f"runtime-windows-x64-{version}.zip"
    archive = root / archive_name
    components = {
        "indesign_cli": version,
        "html_indesign": plugin_version,
        "node": "22.15.0",
        "winax": "3.6.2",
        "browser": "msedge",
    }
    metadata = {
        "schema_version": 2,
        "name": "indesign-cli-runtime",
        "version": version,
        "platform": "windows-x64",
        "components": components,
        "artifact": {
            "file": archive_name,
            "url": artifact_url if artifact_url is not None else rf"\\daga-nas5\sa-ai-app\tools\indesign-cli\{archive_name}",
            "github_url": f"https://github.com/example/releases/download/v{version}/{archive_name}",
            "sha256": "0" * 64,
        },
    }
    with zipfile.ZipFile(archive, "w") as payload:
        payload.writestr("runtime-metadata.json", json.dumps(metadata))
        payload.writestr("cli/indesign-cli.exe", b"MZcli")
        if entry_script:
            payload.writestr("indesign-cli.ps1", b"# entry")
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    manifest = json.loads(json.dumps(metadata))
    manifest["artifact"]["sha256"] = "f" * 64 if corrupt_checksum else digest
    (root / "runtime-latest.json").write_text(json.dumps(manifest), encoding="utf-8")
    (root / f"{archive_name}.sha256").write_text(f"{digest}  {archive_name}\n", encoding="utf-8")
    (root / "indesign-cli-agent-setup.exe").write_bytes(b"MZsetup")
    return root


def test_publish_runtime_dry_run_then_archives_and_switches_current_manifest(tmp_path):
    publisher = _load_publisher()
    nas_root = tmp_path / "nas"
    old_source = _write_release(tmp_path / "old", "0.5.0", "0.2.0")
    for path in old_source.iterdir():
        (nas_root / path.name).parent.mkdir(parents=True, exist_ok=True)
        (nas_root / path.name).write_bytes(path.read_bytes())
    old_archive = nas_root / "releases" / "0.5.0"
    old_archive.mkdir(parents=True)
    for path in old_source.iterdir():
        (old_archive / path.name).write_bytes(path.read_bytes())

    release = _write_release(tmp_path / "new", "0.5.1", "0.2.1")
    dry_run = publisher.publish_release(release, nas_root=nas_root, dry_run=True)
    assert dry_run["ok"] is True
    assert dry_run["dry_run"] is True
    assert not (nas_root / "releases" / "0.5.1").exists()
    assert json.loads((nas_root / "runtime-latest.json").read_text())["version"] == "0.5.0"

    result = publisher.publish_release(release, nas_root=nas_root, dry_run=False)

    assert result["ok"] is True
    assert result["verify"]["version"] == "0.5.1"
    assert result["verify"]["sha256_match"] is True
    assert (nas_root / "releases" / "0.5.0" / "runtime-latest.json").is_file()
    assert (nas_root / "releases" / "0.5.1" / "runtime-latest.json").is_file()
    assert json.loads((nas_root / "runtime-latest.json").read_text())["version"] == "0.5.1"
    assert (nas_root / "runtime-windows-x64-0.5.1.zip").is_file()
    assert not (nas_root / "runtime-windows-x64-0.5.0.zip").exists()


def test_publish_runtime_rejects_non_unc_artifact_url(tmp_path):
    publisher = _load_publisher()
    archive_name = "runtime-windows-x64-0.5.1.zip"
    release = _write_release(
        tmp_path / "release",
        "0.5.1",
        "0.2.1",
        # shell 转义吃掉一层反斜杠后的真实事故形态：\daga-nas5\...
        artifact_url=rf"\daga-nas5\sa-ai-app\tools\indesign-cli\{archive_name}",
    )

    try:
        publisher.publish_release(release, nas_root=tmp_path / "nas", dry_run=True)
    except SystemExit as exc:
        assert "UNC" in str(exc)
    else:
        raise AssertionError("malformed artifact url was accepted")


def test_publish_runtime_rejects_manifest_checksum_mismatch(tmp_path):
    publisher = _load_publisher()
    release = _write_release(tmp_path / "release", "0.5.1", "0.2.1", corrupt_checksum=True)

    try:
        publisher.publish_release(release, nas_root=tmp_path / "nas", dry_run=True)
    except SystemExit as exc:
        assert "SHA-256" in str(exc)
    else:
        raise AssertionError("corrupt runtime release was accepted")


# —— SA-AIAPP 工具箱货架 ——
# 同事电脑上的 runtime 靠 launcher 自更新，而 launcher 在 SA Agent 的环境里找不到 Edge 就拒绝升级、
# 静默回落旧版（2026-09-23 对话快照查实）。改由 SA 每次启动时的工具箱从货架装最新 runtime；
# 所以每次发版都要把 runtime 同步上货架，SA 那边照货架条目装机。

OTHER_SHELF_TOOLS = {
    "pwsh": {"version": "7.4.18", "archive": "PowerShell-7.4.18-win-x64.zip", "sha256": "d" * 64},
    "samap": {"version": "0.2.1", "archive": "samap-0.2.1-win-x64.zip", "sha256": "8" * 64},
}


def _write_shelf(root: Path, extra: dict | None = None) -> Path:
    root.mkdir(parents=True, exist_ok=True)
    manifest = {**OTHER_SHELF_TOOLS, **(extra or {})}
    (root / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return root


def _seed_nas(tmp_path: Path, nas_root: Path) -> None:
    old_source = _write_release(tmp_path / "old", "0.5.0", "0.2.0")
    old_archive = nas_root / "releases" / "0.5.0"
    old_archive.mkdir(parents=True)
    for path in old_source.iterdir():
        (nas_root / path.name).write_bytes(path.read_bytes())
        (old_archive / path.name).write_bytes(path.read_bytes())


def _zip_sha(release: Path, version: str) -> str:
    return hashlib.sha256((release / f"runtime-windows-x64-{version}.zip").read_bytes()).hexdigest()


def test_shelf_contract_names_match_sa_toolbox_and_runtime_entry():
    publisher = _load_publisher()
    import support  # noqa: F401
    from cli_anything.indesign.core.bootstrapper import RUNTIME_ENTRY_SCRIPT_NAME

    # 货架键就是 SA 工具箱适配器名，SA 按 SA_AGENT_<键大写> 把位置交给 Agent。
    assert publisher.SHELF_TOOL_NAME == "indesign"
    assert publisher.RUNTIME_ENTRY_SCRIPT_NAME == RUNTIME_ENTRY_SCRIPT_NAME
    assert publisher.shelf_archive_name("0.5.15") == "indesign-cli-0.5.15-win-x64.zip"


def test_publish_with_shelf_dry_run_plans_but_touches_neither_nas_nor_shelf(tmp_path):
    publisher = _load_publisher()
    nas_root = tmp_path / "nas"
    _seed_nas(tmp_path, nas_root)
    shelf = _write_shelf(tmp_path / "shelf")
    before = (shelf / "manifest.json").read_bytes()
    release = _write_release(tmp_path / "new", "0.5.1", "0.2.1")

    result = publisher.publish_release(release, nas_root=nas_root, shelf_root=shelf, dry_run=True)

    assert result["plan"]["shelf"]["entry"] == {
        "version": "0.5.1",
        "archive": "indesign-cli-0.5.1-win-x64.zip",
        "sha256": _zip_sha(release, "0.5.1"),
    }
    assert (shelf / "manifest.json").read_bytes() == before
    assert not (shelf / "indesign-cli-0.5.1-win-x64.zip").exists()
    assert json.loads((nas_root / "runtime-latest.json").read_text())["version"] == "0.5.0"


def test_publish_with_shelf_adds_entry_keeps_other_tools_and_backs_up_manifest(tmp_path):
    publisher = _load_publisher()
    nas_root = tmp_path / "nas"
    _seed_nas(tmp_path, nas_root)
    shelf = _write_shelf(tmp_path / "shelf")
    before = (shelf / "manifest.json").read_bytes()
    release = _write_release(tmp_path / "new", "0.5.1", "0.2.1")

    result = publisher.publish_release(release, nas_root=nas_root, shelf_root=shelf, dry_run=False)

    manifest = json.loads((shelf / "manifest.json").read_text(encoding="utf-8"))
    digest = _zip_sha(release, "0.5.1")
    assert manifest["indesign"] == {"version": "0.5.1", "archive": "indesign-cli-0.5.1-win-x64.zip", "sha256": digest}
    for name, entry in OTHER_SHELF_TOOLS.items():
        assert manifest[name] == entry
    assert list(manifest)[: len(OTHER_SHELF_TOOLS)] == list(OTHER_SHELF_TOOLS)
    assert hashlib.sha256((shelf / "indesign-cli-0.5.1-win-x64.zip").read_bytes()).hexdigest() == digest
    backups = list(shelf.glob("manifest.json.bak-before-indesign-0.5.1-*"))
    assert len(backups) == 1 and backups[0].read_bytes() == before
    # SA 装机侧按 JSON.parse 读，带 BOM 会整张货架读不出来。
    assert not (shelf / "manifest.json").read_bytes().startswith(bytes([0xEF, 0xBB, 0xBF]))
    assert result["shelf"]["changed"] is True
    assert json.loads((nas_root / "runtime-latest.json").read_text())["version"] == "0.5.1"


def test_shelf_rejects_runtime_without_entry_script_before_touching_nas(tmp_path):
    publisher = _load_publisher()
    nas_root = tmp_path / "nas"
    _seed_nas(tmp_path, nas_root)
    shelf = _write_shelf(tmp_path / "shelf")
    release = _write_release(tmp_path / "new", "0.5.1", "0.2.1", entry_script=False)

    try:
        publisher.publish_release(release, nas_root=nas_root, shelf_root=shelf, dry_run=False)
    except SystemExit as exc:
        assert "indesign-cli.ps1" in str(exc)
    else:
        raise AssertionError("runtime without entry script reached the shelf")
    assert json.loads((nas_root / "runtime-latest.json").read_text())["version"] == "0.5.0"


def test_shelf_refuses_to_go_backwards(tmp_path):
    publisher = _load_publisher()
    shelf = _write_shelf(
        tmp_path / "shelf",
        {"indesign": {"version": "0.5.9", "archive": "indesign-cli-0.5.9-win-x64.zip", "sha256": "a" * 64}},
    )
    release = _write_release(tmp_path / "new", "0.5.1", "0.2.1")

    try:
        publisher.publish_to_shelf(
            release / "runtime-windows-x64-0.5.1.zip", version="0.5.1", sha256=_zip_sha(release, "0.5.1"), shelf_root=shelf
        )
    except SystemExit as exc:
        assert "increase" in str(exc)
    else:
        raise AssertionError("shelf accepted an older runtime")


def test_shelf_rerun_of_the_same_release_changes_nothing(tmp_path):
    publisher = _load_publisher()
    shelf = _write_shelf(tmp_path / "shelf")
    release = _write_release(tmp_path / "new", "0.5.1", "0.2.1")
    archive = release / "runtime-windows-x64-0.5.1.zip"
    digest = _zip_sha(release, "0.5.1")

    first = publisher.publish_to_shelf(archive, version="0.5.1", sha256=digest, shelf_root=shelf)
    manifest_after_first = (shelf / "manifest.json").read_bytes()
    second = publisher.publish_to_shelf(archive, version="0.5.1", sha256=digest, shelf_root=shelf)

    assert first["changed"] is True
    assert second["changed"] is False
    assert (shelf / "manifest.json").read_bytes() == manifest_after_first
    assert len(list(shelf.glob("manifest.json.bak-before-indesign-*"))) == 1


def test_shelf_failure_after_nas_publish_keeps_nas_and_explains_retry(tmp_path, monkeypatch):
    publisher = _load_publisher()
    nas_root = tmp_path / "nas"
    _seed_nas(tmp_path, nas_root)
    shelf = _write_shelf(tmp_path / "shelf")
    release = _write_release(tmp_path / "new", "0.5.1", "0.2.1")
    real = publisher.publish_to_shelf

    def fail_when_real(*args, **kwargs):
        if kwargs.get("dry_run"):
            return real(*args, **kwargs)
        raise SystemExit("shelf write denied")

    monkeypatch.setattr(publisher, "publish_to_shelf", fail_when_real)

    try:
        publisher.publish_release(release, nas_root=nas_root, shelf_root=shelf, dry_run=False)
    except SystemExit as exc:
        assert "--shelf-only" in str(exc)
        assert "0.5.1" in str(exc)
    else:
        raise AssertionError("shelf failure was swallowed")
    # 货架是独立的第二条分发路，它失败不能把已经完好发布的 NAS 版本回滚掉。
    assert json.loads((nas_root / "runtime-latest.json").read_text())["version"] == "0.5.1"
    assert "indesign" not in json.loads((shelf / "manifest.json").read_text())


def test_publish_without_shelf_root_never_touches_a_shelf(tmp_path):
    publisher = _load_publisher()
    nas_root = tmp_path / "nas"
    _seed_nas(tmp_path, nas_root)
    release = _write_release(tmp_path / "new", "0.5.1", "0.2.1")

    result = publisher.publish_release(release, nas_root=nas_root, dry_run=False)

    assert "shelf" not in result
    assert "shelf" not in result["plan"]


def test_cli_shelf_only_syncs_the_shelf_from_a_release_dir(tmp_path, capsys):
    publisher = _load_publisher()
    shelf = _write_shelf(tmp_path / "shelf")
    release = _write_release(tmp_path / "new", "0.5.1", "0.2.1")

    code = publisher.main(["--release-dir", str(release), "--shelf-root", str(shelf), "--shelf-only"])

    assert code == 0
    assert json.loads((shelf / "manifest.json").read_text())["indesign"]["version"] == "0.5.1"
    assert json.loads(capsys.readouterr().out)["shelf"]["changed"] is True
