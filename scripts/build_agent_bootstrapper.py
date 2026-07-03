from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]


def copytree_clean(source: Path, target: Path) -> None:
    if target.exists():
        shutil.rmtree(target)
    shutil.copytree(source, target)


def prepare_runtime(stage: Path, node_root: Path, node_modules: Path) -> Path:
    runtime = stage / "runtime"
    server = runtime / "server"
    node_target = runtime / "node"
    stage.mkdir(parents=True, exist_ok=True)

    copytree_clean(node_root, node_target)
    server.mkdir(parents=True, exist_ok=True)
    shutil.copy2(REPO_ROOT / "package.json", server / "package.json")
    package_lock = REPO_ROOT / "package-lock.json"
    if package_lock.exists():
        shutil.copy2(package_lock, server / "package-lock.json")
    copytree_clean(REPO_ROOT / "src", server / "src")
    copytree_clean(node_modules, server / "node_modules")

    winax_dir = server / "node_modules" / "winax"
    if not winax_dir.exists():
        raise SystemExit(f"winax is missing from node_modules: {winax_dir}")
    node_exe = node_target / ("node.exe" if sys.platform == "win32" else "node")
    if not node_exe.exists():
        raise SystemExit(f"node executable is missing from node root: {node_exe}")

    manifest = {
        "schema_version": 1,
        "runtime": "indesign-cli-agent",
        "platform": sys.platform,
        "node_executable": str(Path("node") / node_exe.name),
        "server_root": "server",
    }
    (runtime / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return runtime


def write_entrypoint(stage: Path) -> Path:
    entrypoint = stage / "agent_bootstrapper_entry.py"
    entrypoint.write_text(
        "from cli_anything.indesign.agent_bootstrapper import main\n"
        "raise SystemExit(main())\n",
        encoding="utf-8",
    )
    return entrypoint


def pyinstaller_add_data_arg(source: Path, dest: str) -> str:
    separator = ";" if sys.platform == "win32" else ":"
    return f"{source}{separator}{dest}"


def build_pyinstaller_args(stage: Path, output_dir: Path, name: str = "indesign-cli-agent") -> list[str]:
    runtime = stage / "runtime"
    entrypoint = stage / "agent_bootstrapper_entry.py"
    return [
        sys.executable,
        "-m",
        "PyInstaller",
        "--onefile",
        "--clean",
        "--name",
        name,
        "--paths",
        str(REPO_ROOT / "agent-harness"),
        "--distpath",
        str(output_dir),
        "--workpath",
        str(stage / "pyinstaller-work"),
        "--specpath",
        str(stage / "pyinstaller-spec"),
        "--add-data",
        pyinstaller_add_data_arg(runtime, "runtime"),
        str(entrypoint),
    ]


def build_release(node_root: Path, node_modules: Path, output_dir: Path, stage: Path, *, dry_run: bool = False) -> dict:
    runtime = prepare_runtime(stage, node_root, node_modules)
    entrypoint = write_entrypoint(stage)
    args = build_pyinstaller_args(stage, output_dir)
    payload = {
        "runtime": str(runtime),
        "entrypoint": str(entrypoint),
        "output_dir": str(output_dir),
        "pyinstaller_args": args,
    }
    if dry_run:
        payload["ran"] = False
        return payload
    result = subprocess.run(args, text=True, encoding="utf-8", check=False)
    payload["ran"] = True
    payload["returncode"] = result.returncode
    if result.returncode != 0:
        raise SystemExit(result.returncode)
    return payload


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Build the single-file indesign-cli-agent.exe with embedded runtime.")
    parser.add_argument("--node-root", required=True, help="Portable Node root containing node.exe")
    parser.add_argument("--node-modules", required=True, help="Prebuilt server node_modules containing winax")
    parser.add_argument("--output-dir", default="dist-agent", help="Output directory for indesign-cli-agent.exe")
    parser.add_argument("--stage", default=".build/agent-bootstrapper", help="Temporary staging directory")
    parser.add_argument("--dry-run", action="store_true", help="Prepare runtime and print PyInstaller command without building")
    args = parser.parse_args(argv)

    payload = build_release(
        node_root=Path(args.node_root).resolve(),
        node_modules=Path(args.node_modules).resolve(),
        output_dir=Path(args.output_dir).resolve(),
        stage=Path(args.stage).resolve(),
        dry_run=args.dry_run,
    )
    print(json.dumps({"ok": True, "data": payload}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
