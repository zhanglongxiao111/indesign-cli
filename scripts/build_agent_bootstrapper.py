from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tarfile
import zipfile
from pathlib import Path
from typing import Any, Callable


REPO_ROOT = Path(__file__).resolve().parents[1]
AGENT_HARNESS = REPO_ROOT / "agent-harness"
RUNTIME_NAME = "indesign-cli-runtime"
SEMVER = re.compile(r"^\d+\.\d+\.\d+$")


def copytree_clean(source: Path, target: Path) -> None:
    if target.exists():
        shutil.rmtree(target)
    shutil.copytree(source, target)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def pyinstaller_add_data_arg(source: Path, dest: str) -> str:
    separator = ";" if os.name == "nt" else ":"
    return f"{source}{separator}{dest}"


def write_entrypoints(stage: Path) -> dict[str, Path]:
    entries = stage / "entrypoints"
    entries.mkdir(parents=True, exist_ok=True)
    payloads = {
        "cli": "from cli_anything.indesign.indesign_cli import main\nraise SystemExit(main())\n",
        "launcher": "from cli_anything.indesign.agent_bootstrapper import main\nraise SystemExit(main())\n",
        "setup": "from cli_anything.indesign.setup_installer import main\nraise SystemExit(main())\n",
    }
    result: dict[str, Path] = {}
    for name, source in payloads.items():
        path = entries / f"{name}_entry.py"
        path.write_text(source, encoding="utf-8")
        result[name] = path
    return result


def build_pyinstaller_plan(
    *,
    stage: Path,
    output_dir: Path,
    runtime_root: Path | None = None,
    launcher_exe: Path | None = None,
) -> dict[str, list[str]]:
    entries = write_entrypoints(stage)
    runtime = runtime_root or stage / "runtime"
    launcher = launcher_exe or output_dir / "indesign-cli-agent.exe"
    common = [sys.executable, "-m", "PyInstaller", "--clean", "--noconfirm", "--paths", str(AGENT_HARNESS)]
    cli = [
        *common,
        "--onedir",
        "--name",
        "indesign-cli",
        "--distpath",
        str(stage / "cli-dist"),
        "--workpath",
        str(stage / "pyinstaller-work" / "cli"),
        "--specpath",
        str(stage / "pyinstaller-spec" / "cli"),
        "--add-data",
        pyinstaller_add_data_arg(
            AGENT_HARNESS / "cli_anything" / "indesign" / "node" / "internal_tool_bridge.mjs",
            "cli_anything/indesign/node",
        ),
        str(entries["cli"]),
    ]
    launcher_args = [
        *common,
        "--onefile",
        "--name",
        "indesign-cli-agent",
        "--distpath",
        str(output_dir),
        "--workpath",
        str(stage / "pyinstaller-work" / "launcher"),
        "--specpath",
        str(stage / "pyinstaller-spec" / "launcher"),
        str(entries["launcher"]),
    ]
    setup = [
        *common,
        "--onefile",
        "--name",
        "indesign-cli-agent-setup",
        "--distpath",
        str(output_dir),
        "--workpath",
        str(stage / "pyinstaller-work" / "setup"),
        "--specpath",
        str(stage / "pyinstaller-spec" / "setup"),
        "--add-data",
        pyinstaller_add_data_arg(runtime, "runtime"),
        "--add-data",
        pyinstaller_add_data_arg(launcher, "payload"),
        str(entries["setup"]),
    ]
    return {"cli": cli, "launcher": launcher_args, "setup": setup}


def _safe_extract_tgz(archive: Path, target: Path) -> None:
    target.mkdir(parents=True, exist_ok=True)
    target_resolved = target.resolve()
    with tarfile.open(archive, "r:gz") as payload:
        members = payload.getmembers()
        for member in members:
            destination = (target / member.name).resolve()
            try:
                destination.relative_to(target_resolved)
            except ValueError as exc:
                raise SystemExit(f"HTML plugin archive contains unsafe path: {member.name}") from exc
            if member.issym() or member.islnk():
                raise SystemExit(f"HTML plugin archive contains unsupported link: {member.name}")
        for member in members:
            destination = target / member.name
            if member.isdir():
                destination.mkdir(parents=True, exist_ok=True)
                continue
            if not member.isfile():
                raise SystemExit(f"HTML plugin archive contains unsupported member: {member.name}")
            destination.parent.mkdir(parents=True, exist_ok=True)
            source = payload.extractfile(member)
            if source is None:
                raise SystemExit(f"Cannot read HTML plugin archive member: {member.name}")
            with source, destination.open("wb") as output:
                shutil.copyfileobj(source, output)


def _read_json(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, json.JSONDecodeError) as exc:
        raise SystemExit(f"Invalid JSON file: {path}") from exc
    if not isinstance(payload, dict):
        raise SystemExit(f"JSON file must contain an object: {path}")
    return payload


def _html_plugin_version(package_json_path: Path, manifest_path: Path) -> str:
    package_json = _read_json(package_json_path)
    manifest = _read_json(manifest_path)
    package_version = str(package_json.get("version") or "").strip()
    manifest_version = str(manifest.get("version") or "").strip()
    if package_json.get("name") != "@sa/html-indesign":
        raise SystemExit("HTML plugin package identity is invalid")
    if manifest.get("id") != "html-indesign":
        raise SystemExit("HTML plugin manifest identity is invalid")
    if not SEMVER.fullmatch(package_version) or package_version != manifest_version:
        raise SystemExit(
            "HTML plugin package and manifest versions must match and use semantic versioning"
        )
    return package_version


def _repository_version() -> str:
    version = str(_read_json(REPO_ROOT / "package.json").get("version") or "").strip()
    if not SEMVER.fullmatch(version):
        raise SystemExit("Repository package version is invalid")
    return version


def _run_checked(runner: Callable[..., Any], args: list[str], *, cwd: Path) -> None:
    result = runner(
        args,
        cwd=cwd,
        text=True,
        encoding="utf-8",
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if result.returncode != 0:
        raise SystemExit(f"Command failed ({result.returncode}): {' '.join(args)}\n{str(result.stderr or '')[-2000:]}")


def resolve_npm_bin(node_root: Path, npm_bin: str) -> str:
    portable = node_root / "npm.cmd"
    if npm_bin == "npm" and portable.is_file():
        return str(portable)
    return npm_bin


def assemble_runtime(
    *,
    cli_onedir: Path,
    node_root: Path,
    node_modules: Path,
    html_plugin_tgz: Path,
    target: Path,
    npm_bin: str = "npm",
    runner: Callable[..., Any] = subprocess.run,
) -> Path:
    required = [cli_onedir / "indesign-cli.exe", node_root / "node.exe", node_modules / "winax" / "package.json", html_plugin_tgz]
    missing = [str(path) for path in required if not path.exists()]
    if missing:
        raise SystemExit(f"Runtime input is incomplete: {missing}")
    if target.exists():
        shutil.rmtree(target)
    target.mkdir(parents=True)

    copytree_clean(cli_onedir, target / "cli")
    copytree_clean(node_root, target / "node")

    server = target / "server"
    server.mkdir()
    shutil.copy2(REPO_ROOT / "package.json", server / "package.json")
    if (REPO_ROOT / "package-lock.json").is_file():
        shutil.copy2(REPO_ROOT / "package-lock.json", server / "package-lock.json")
    copytree_clean(REPO_ROOT / "src", server / "src")
    copytree_clean(node_modules, server / "node_modules")

    extract_root = target.parent / f".{target.name}-plugin-extract"
    if extract_root.exists():
        shutil.rmtree(extract_root)
    try:
        _safe_extract_tgz(html_plugin_tgz, extract_root)
        package_root = extract_root / "package"
        package_json = _read_json(package_root / "package.json")
        source_manifest = package_root / "src" / "indesign-cli-plugin" / "manifest.json"
        _html_plugin_version(package_root / "package.json", source_manifest)
        plugin = target / "plugins" / "html-indesign"
        copytree_clean(package_root, plugin)
        installed_manifest = plugin / "src" / "indesign-cli-plugin" / "manifest.json"
        shutil.copy2(installed_manifest, plugin / "manifest.json")
        _run_checked(
            runner,
            [npm_bin, "install", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"],
            cwd=plugin,
        )
        dependencies = package_json.get("dependencies")
        if not isinstance(dependencies, dict) or not dependencies:
            raise SystemExit("HTML plugin package has no production dependencies")
        missing_dependencies = [
            name for name in dependencies if not (plugin / "node_modules" / str(name) / "package.json").is_file()
        ]
        if missing_dependencies:
            raise SystemExit(f"HTML plugin production dependencies are incomplete: {missing_dependencies}")
        for required_plugin_file in (
            plugin / "src" / "indesign-cli-plugin" / "index.js",
            plugin / "_indesign_scripts" / "build_from_instructions.jsx",
            plugin / "_indesign_scripts" / "lib",
            plugin / "presets",
        ):
            if not required_plugin_file.exists():
                raise SystemExit(f"HTML plugin runtime file is missing: {required_plugin_file}")
    finally:
        shutil.rmtree(extract_root, ignore_errors=True)
    return target


def _zip_tree(source: Path, archive: Path) -> None:
    archive.parent.mkdir(parents=True, exist_ok=True)
    archive.unlink(missing_ok=True)
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as payload:
        for path in sorted(source.rglob("*")):
            if path.is_file():
                payload.write(path, path.relative_to(source).as_posix())


def write_runtime_release(
    runtime_root: Path,
    *,
    output_dir: Path,
    version: str,
    nas_url: str,
    github_url: str,
    components: dict[str, str],
) -> dict[str, Path]:
    if components.get("indesign_cli") != version:
        raise SystemExit("components.indesign_cli must equal the runtime version")
    required_components = {"indesign_cli", "html_indesign", "node", "winax", "browser"}
    if not required_components.issubset(components) or components.get("browser") != "msedge":
        raise SystemExit("Runtime components are incomplete or browser is not msedge")
    output_dir.mkdir(parents=True, exist_ok=True)
    archive = output_dir / f"runtime-windows-x64-{version}.zip"
    base_manifest = {
        "schema_version": 2,
        "name": RUNTIME_NAME,
        "version": version,
        "platform": "windows-x64",
        "components": components,
        "artifact": {
            "file": archive.name,
            "url": nas_url,
            "github_url": github_url,
            # A runtime cannot contain its own final archive digest without
            # changing that digest. Embedded metadata is therefore identity
            # metadata only; runtime-latest.json below is the integrity source.
            "sha256": "0" * 64,
        },
    }
    embedded_text = json.dumps(base_manifest, ensure_ascii=False, indent=2)
    (runtime_root / "runtime-metadata.json").write_text(embedded_text, encoding="utf-8")
    _zip_tree(runtime_root, archive)
    digest = sha256_file(archive)
    manifest_payload = json.loads(embedded_text)
    manifest_payload["artifact"]["sha256"] = digest
    manifest = output_dir / "runtime-latest.json"
    text = json.dumps(manifest_payload, ensure_ascii=False, indent=2)
    manifest.write_text(text, encoding="utf-8")
    checksum = output_dir / f"{archive.name}.sha256"
    checksum.write_text(f"{digest}  {archive.name}\n", encoding="utf-8")
    return {"archive": archive, "manifest": manifest, "checksum": checksum}


def _run_pyinstaller(args: list[str]) -> None:
    Path(args[args.index("--distpath") + 1]).mkdir(parents=True, exist_ok=True)
    result = subprocess.run(args, text=True, encoding="utf-8", check=False)
    if result.returncode != 0:
        raise SystemExit(result.returncode)


def _component_versions(
    node_root: Path,
    node_modules: Path,
    *,
    runtime_root: Path,
    runtime_version: str,
    runner: Callable[..., Any] = subprocess.run,
) -> dict[str, str]:
    node_result = runner(
        [str(node_root / "node.exe"), "--version"],
        text=True,
        encoding="utf-8",
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if node_result.returncode != 0:
        raise SystemExit("Cannot determine portable Node version")
    node_version = str(node_result.stdout).strip().removeprefix("v")
    winax = str(_read_json(node_modules / "winax" / "package.json").get("version") or "")
    plugin = runtime_root / "plugins" / "html-indesign"
    html_indesign = _html_plugin_version(plugin / "package.json", plugin / "manifest.json")
    if not node_version or not winax:
        raise SystemExit("Node/winax component version is missing")
    return {
        "indesign_cli": runtime_version,
        "html_indesign": html_indesign,
        "node": node_version,
        "winax": winax,
        "browser": "msedge",
    }


def build_release(
    *,
    node_root: Path,
    node_modules: Path,
    html_plugin_tgz: Path,
    output_dir: Path,
    stage: Path,
    version: str,
    nas_url: str,
    github_url: str,
    npm_bin: str = "npm",
    dry_run: bool = False,
) -> dict[str, Any]:
    repository_version = _repository_version()
    if version != repository_version:
        raise SystemExit(
            f"Runtime version {version} must match repository version {repository_version}"
        )
    for path in (node_root / "node.exe", node_modules / "winax" / "package.json", html_plugin_tgz):
        if not path.exists():
            raise SystemExit(f"Required build input is missing: {path}")
    output_dir.mkdir(parents=True, exist_ok=True)
    runtime = stage / "runtime"
    launcher = output_dir / "indesign-cli-agent.exe"
    plan = build_pyinstaller_plan(stage=stage, output_dir=output_dir, runtime_root=runtime, launcher_exe=launcher)
    if dry_run:
        return {"ran": False, "runtime": str(runtime), "output_dir": str(output_dir), "pyinstaller": plan}

    _run_pyinstaller(plan["cli"])
    _run_pyinstaller(plan["launcher"])
    cli_onedir = stage / "cli-dist" / "indesign-cli"
    assemble_runtime(
        cli_onedir=cli_onedir,
        node_root=node_root,
        node_modules=node_modules,
        html_plugin_tgz=html_plugin_tgz,
        target=runtime,
        npm_bin=resolve_npm_bin(node_root, npm_bin),
    )
    components = _component_versions(
        node_root,
        node_modules,
        runtime_root=runtime,
        runtime_version=version,
    )
    release = write_runtime_release(
        runtime,
        output_dir=output_dir,
        version=version,
        nas_url=nas_url,
        github_url=github_url,
        components=components,
    )
    _run_pyinstaller(plan["setup"])
    setup = output_dir / "indesign-cli-agent-setup.exe"
    if not setup.is_file() or not launcher.is_file():
        raise SystemExit("PyInstaller did not produce the launcher/setup artifacts")
    return {
        "ran": True,
        "runtime": str(runtime),
        "launcher": str(launcher),
        "setup": str(setup),
        "archive": str(release["archive"]),
        "manifest": str(release["manifest"]),
        "checksum": str(release["checksum"]),
        "components": components,
        "pyinstaller": plan,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Build the persistent indesign-cli runtime and complete offline Setup EXE.")
    parser.add_argument("--node-root", required=True, help="Portable Node root containing node.exe")
    parser.add_argument("--node-modules", required=True, help="Server production node_modules containing winax")
    parser.add_argument("--html-plugin-tgz", required=True, help="Packed @sa/html-indesign tgz")
    parser.add_argument("--npm-bin", default="npm", help="npm executable used to install plugin production dependencies")
    parser.add_argument("--version", required=True, help="Runtime version; must match package.json")
    parser.add_argument("--nas-url", required=True, help="NAS URL/path for the runtime ZIP")
    parser.add_argument("--github-url", required=True, help="GitHub fallback URL for the runtime ZIP")
    parser.add_argument("--output-dir", default="dist-agent", help="Release artifact directory")
    parser.add_argument("--stage", default=".build/agent-runtime", help="Temporary build directory")
    parser.add_argument("--dry-run", action="store_true", help="Validate inputs and print the three build commands")
    args = parser.parse_args(argv)
    payload = build_release(
        node_root=Path(args.node_root).resolve(),
        node_modules=Path(args.node_modules).resolve(),
        html_plugin_tgz=Path(args.html_plugin_tgz).resolve(),
        output_dir=Path(args.output_dir).resolve(),
        stage=Path(args.stage).resolve(),
        version=args.version,
        nas_url=args.nas_url,
        github_url=args.github_url,
        npm_bin=args.npm_bin,
        dry_run=args.dry_run,
    )
    print(json.dumps({"ok": True, "data": payload}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
