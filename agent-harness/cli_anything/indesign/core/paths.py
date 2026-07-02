from __future__ import annotations

import hashlib
import re
from pathlib import Path


def _hash_path(path: Path) -> str:
    digest = hashlib.sha256(str(path).encode("utf-8")).hexdigest()
    return digest[:16]


def scrub_path(path_value: str, cwd: Path) -> dict[str, object]:
    path = Path(path_value)
    try:
        resolved = path.resolve()
    except OSError:
        resolved = path
    try:
        relative = resolved.relative_to(cwd.resolve())
        return {
            "path": str(relative).replace("\\", "/"),
            "external": False,
            "extension": resolved.suffix.lower(),
        }
    except ValueError:
        return {
            "external": True,
            "kind": "external_path",
            "extension": resolved.suffix.lower(),
            "hash": _hash_path(resolved),
        }


def scrub_text_paths(value: str, allow_roots: list[Path] | None = None) -> str:
    # 白名单内（默认 cwd）的路径输出相对形式，供 Agent 自我修复；白名单外按外部资产打码。
    roots: list[Path] = []
    for root in allow_roots if allow_roots is not None else [Path.cwd()]:
        try:
            roots.append(root.resolve())
        except OSError:
            continue

    def replace(match: re.Match[str]) -> str:
        raw_path = match.group(0)
        path = Path(raw_path)
        try:
            resolved = path.resolve()
        except OSError:
            resolved = path
        for root in roots:
            try:
                relative = resolved.relative_to(root)
            except ValueError:
                continue
            return str(relative).replace("\\", "/")
        suffix = path.suffix.lower()
        return f"<external_path extension={suffix or 'unknown'} hash={_hash_path(resolved)}>"

    return re.sub(r"[A-Za-z]:[\\/][^'\"\r\n]+", replace, value)
