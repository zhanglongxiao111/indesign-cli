from __future__ import annotations

import hashlib
import os
import re
from functools import lru_cache
from pathlib import Path

_PATH_PREFIX = (
    r"(?:"
    r"(?<![A-Za-z])[A-Za-z]:(?:\\\\|[\\/])"
    r"|(?:\\){2,4}[^\\/'\"\r\n\s]+(?:\\\\|[\\/])"
    r"|(?<!:)//[^\\/'\"\r\n\s]+/"
    r")"
)
_NO_URL_AHEAD = r"(?!\s+[A-Za-z][A-Za-z0-9+.-]*://)"
_TEXT_PATH_RE = re.compile(
    rf"(?:"
    rf"(?<=['\"]){_PATH_PREFIX}[^'\"\r\n]+"
    rf"|{_PATH_PREFIX}(?:{_NO_URL_AHEAD}[^'\"\r\n:])*\.[A-Za-z0-9]{{1,12}}(?=$|[\s'\".,;)\]}}])"
    rf"|{_PATH_PREFIX}(?:{_NO_URL_AHEAD}[^'\"\r\n])+"
    rf")"
)


def _hash_path(path: Path) -> str:
    digest = hashlib.sha256(str(path).encode("utf-8")).hexdigest()
    return digest[:16]


def _normalize_matched_path(raw_path: str) -> str:
    if raw_path.startswith("\\\\\\\\"):
        return "\\\\" + raw_path[4:].replace("\\\\", "\\")
    if len(raw_path) >= 4 and raw_path[1:4] == ":\\\\":
        return raw_path[:2] + "\\" + raw_path[4:].replace("\\\\", "\\")
    return raw_path


@lru_cache(maxsize=64)
def _resolve_root_cached(raw_root: str) -> tuple[Path, Path]:
    path = Path(raw_root)
    try:
        resolved = path.resolve()
    except OSError:
        resolved = path
    norm_root = Path(os.path.normpath(str(resolved)))
    return resolved, norm_root


def clear_allow_roots_cache() -> None:
    _resolve_root_cached.cache_clear()


def _resolve_allow_roots(allow_roots: list[Path] | None) -> tuple[tuple[Path, Path], ...]:
    raw_roots = [str(root) for root in allow_roots] if allow_roots is not None else [str(Path.cwd())]
    return tuple(_resolve_root_cached(raw) for raw in raw_roots)


def scrub_path(path_value: str, cwd: Path) -> dict[str, object]:
    path = Path(path_value)
    try:
        resolved = path.resolve()
    except OSError:
        resolved = path
    resolved_cwd, _ = _resolve_root_cached(str(cwd))
    try:
        relative = resolved.relative_to(resolved_cwd)
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
    if not value:
        return value
    roots: tuple[tuple[Path, Path], ...] | None = None

    def replace(match: re.Match[str]) -> str:
        nonlocal roots
        if roots is None:
            roots = _resolve_allow_roots(allow_roots)
        normalized = _normalize_matched_path(match.group(0))
        is_unc = normalized.startswith(("\\\\", "//"))
        if is_unc:
            unc_win = "\\\\" + normalized.lstrip("\\/").replace("/", "\\")
            path = Path(os.path.normpath(unc_win))
            for _resolved_root, norm_root in roots:
                if os.path.normcase(norm_root.drive) != os.path.normcase(path.drive):
                    continue
                try:
                    relative = path.relative_to(norm_root)
                except ValueError:
                    continue
                return str(relative).replace("\\", "/")
            suffix = path.suffix.lower()
            return f"<external_path extension={suffix or 'unknown'} hash={_hash_path(path)}>"

        path = Path(normalized)
        try:
            resolved = path.resolve()
        except OSError:
            resolved = path
        for resolved_root, _norm_root in roots:
            try:
                relative = resolved.relative_to(resolved_root)
            except ValueError:
                continue
            return str(relative).replace("\\", "/")
        suffix = path.suffix.lower()
        return f"<external_path extension={suffix or 'unknown'} hash={_hash_path(resolved)}>"

    return _TEXT_PATH_RE.sub(replace, value)
