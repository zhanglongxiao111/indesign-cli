from __future__ import annotations

import shutil
from pathlib import Path

from setuptools import setup
from setuptools.command.build_py import build_py as _build_py


class build_py(_build_py):
    def run(self) -> None:
        super().run()
        self._copy_server_assets()
        self._copy_skill_assets()

    def _copy_server_assets(self) -> None:
        repo_root = Path(__file__).resolve().parent
        target = Path(self.build_lib) / "cli_anything" / "indesign" / "server"
        if target.exists():
            shutil.rmtree(target)
        target.mkdir(parents=True, exist_ok=True)

        shutil.copy2(repo_root / "package.json", target / "package.json")
        package_lock = repo_root / "package-lock.json"
        if package_lock.exists():
            shutil.copy2(package_lock, target / "package-lock.json")
        shutil.copytree(repo_root / "src", target / "src")

    def _copy_skill_assets(self) -> None:
        repo_root = Path(__file__).resolve().parent
        source = repo_root / "skills" / "indesign-cli" / "SKILL.md"
        target = Path(self.build_lib) / "cli_anything" / "indesign" / "skills" / "SKILL.md"
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)


setup(cmdclass={"build_py": build_py})
