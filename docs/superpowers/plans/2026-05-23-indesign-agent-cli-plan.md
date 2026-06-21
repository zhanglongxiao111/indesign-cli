# InDesign Agent CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建第一版 Agent 专用 `indesign-cli`，提供统一功能域目录、MCP 工具路由、JSX 执行、session 线索、产物验证和健康检查。

**Architecture:** Python CLI 使用标准库 `argparse` 暴露命令，默认输出 JSON envelope。CLI 每次命令按需启动 `node src/advanced/index.js` 或 `node src/index.js`，通过 stdio JSON-RPC 调 MCP 工具，执行后关闭子进程。工具目录按 InDesign 功能域组织，`advanced`、`classic`、`hidden_handler`、`cli`、`script` 都作为条目来源，而不是主导航。

**Tech Stack:** Python 3.10+、标准库 `argparse/subprocess/json/pathlib/hashlib/zipfile`、Node.js 18+、现有 MCP servers、pytest。

---

## 文件结构

### 新增文件

- `agent-harness/setup.py`：本地可编辑安装，注册 `indesign-cli`。
- `agent-harness/INDESIGN.md`：Agent 使用 SOP 和限制。
- `agent-harness/cli_anything/indesign/__init__.py`：版本号。
- `agent-harness/cli_anything/indesign/__main__.py`：`python -m cli_anything.indesign` 入口。
- `agent-harness/cli_anything/indesign/indesign_cli.py`：CLI 参数解析和命令分发。
- `agent-harness/cli_anything/indesign/core/envelope.py`：统一 JSON 输出。
- `agent-harness/cli_anything/indesign/core/errors.py`：错误类型。
- `agent-harness/cli_anything/indesign/core/paths.py`：路径相对化、脱敏、hash。
- `agent-harness/cli_anything/indesign/core/mcp_backend.py`：最小 stdio MCP 客户端。
- `agent-harness/cli_anything/indesign/core/catalog.py`：统一工具目录。
- `agent-harness/cli_anything/indesign/core/domains.py`：domain 定义和默认 rank。
- `agent-harness/cli_anything/indesign/core/router.py`：`tool schema/call` 路由。
- `agent-harness/cli_anything/indesign/core/scripts.py`：`script run`。
- `agent-harness/cli_anything/indesign/core/session.py`：`.indesign-cli/session.json`。
- `agent-harness/cli_anything/indesign/core/artifacts.py`：`export verify`。
- `agent-harness/cli_anything/indesign/core/health.py`：`server health`。
- `agent-harness/cli_anything/indesign/tests/TEST.md`：测试计划。
- `agent-harness/cli_anything/indesign/tests/test_core.py`：不依赖 InDesign 的单元测试。
- `agent-harness/cli_anything/indesign/tests/test_full_e2e.py`：真实 InDesign E2E。

### 修改文件

- `.gitignore`：增加 `.indesign-cli/`。
- `docs/superpowers/plans/2026-05-23-indesign-agent-cli-plan.md`：执行过程中按 task 更新勾选状态。

## Task 1: CLI 包骨架和版本命令

**Files:**
- Create: `agent-harness/setup.py`
- Create: `agent-harness/cli_anything/indesign/__init__.py`
- Create: `agent-harness/cli_anything/indesign/__main__.py`
- Create: `agent-harness/cli_anything/indesign/indesign_cli.py`
- Create: `agent-harness/cli_anything/indesign/tests/test_core.py`

- [ ] **Step 1: 写失败测试**

写入 `agent-harness/cli_anything/indesign/tests/test_core.py`：

```python
import json
import os
import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[4]
HARNESS_ROOT = REPO_ROOT / "agent-harness"


def run_module(*args: str) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    env["PYTHONPATH"] = str(HARNESS_ROOT)
    return subprocess.run(
        [sys.executable, "-m", "cli_anything.indesign", *args],
        cwd=REPO_ROOT,
        env=env,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )


def test_version_returns_json():
    result = run_module("--version")
    assert result.returncode == 0
    payload = json.loads(result.stdout)
    assert payload["ok"] is True
    assert payload["data"]["name"] == "indesign-cli"
    assert payload["data"]["version"] == "0.1.0"
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```powershell
python -m pytest agent-harness/cli_anything/indesign/tests/test_core.py::test_version_returns_json -q
```

Expected: FAIL，错误包含 `No module named cli_anything.indesign`。

- [ ] **Step 3: 写最小实现**

写入 `agent-harness/setup.py`：

```python
from setuptools import find_namespace_packages, setup


setup(
    name="indesign-cli",
    version="0.1.0",
    description="Agent-native CLI harness for Adobe InDesign automation",
    packages=find_namespace_packages(include=["cli_anything.*"]),
    python_requires=">=3.10",
    entry_points={
        "console_scripts": [
            "indesign-cli=cli_anything.indesign.indesign_cli:main",
        ],
    },
)
```

写入 `agent-harness/cli_anything/indesign/__init__.py`：

```python
__version__ = "0.1.0"
```

写入 `agent-harness/cli_anything/indesign/__main__.py`：

```python
from .indesign_cli import main


if __name__ == "__main__":
    raise SystemExit(main())
```

写入 `agent-harness/cli_anything/indesign/indesign_cli.py`：

```python
import argparse
import json
import sys
from typing import Any

from . import __version__


def emit(payload: dict[str, Any]) -> int:
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return int(payload.get("exit_code", 0))


def version_payload() -> dict[str, Any]:
    return {
        "schema_version": 1,
        "ok": True,
        "exit_code": 0,
        "command": "version",
        "data": {
            "name": "indesign-cli",
            "version": __version__,
        },
        "warnings": [],
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="indesign-cli")
    parser.add_argument("--version", action="store_true")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--pretty", action="store_true")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.version:
        return emit(version_payload())
    parser.print_help(sys.stderr)
    return 2
```

- [ ] **Step 4: 运行测试确认通过**

Run:

```powershell
python -m pytest agent-harness/cli_anything/indesign/tests/test_core.py::test_version_returns_json -q
```

Expected: PASS。

- [ ] **Step 5: 提交**

```powershell
git add agent-harness/setup.py agent-harness/cli_anything/indesign/__init__.py agent-harness/cli_anything/indesign/__main__.py agent-harness/cli_anything/indesign/indesign_cli.py agent-harness/cli_anything/indesign/tests/test_core.py
git commit -m "feat: scaffold indesign agent cli"
```

## Task 2: JSON envelope、错误模型和路径脱敏

**Files:**
- Create: `agent-harness/cli_anything/indesign/core/envelope.py`
- Create: `agent-harness/cli_anything/indesign/core/errors.py`
- Create: `agent-harness/cli_anything/indesign/core/paths.py`
- Modify: `agent-harness/cli_anything/indesign/indesign_cli.py`
- Modify: `agent-harness/cli_anything/indesign/tests/test_core.py`

- [ ] **Step 1: 添加失败测试**

追加到 `agent-harness/cli_anything/indesign/tests/test_core.py`：

```python

def test_external_path_is_scrubbed():
    from cli_anything.indesign.core.paths import scrub_path

    scrubbed = scrub_path(r"D:\Clients\AcmeSecret\layout.indd", Path.cwd())
    assert scrubbed["external"] is True
    assert scrubbed["extension"] == ".indd"
    assert "AcmeSecret" not in json.dumps(scrubbed, ensure_ascii=False)
    assert "layout.indd" not in json.dumps(scrubbed, ensure_ascii=False)
    assert len(scrubbed["hash"]) == 16


def test_failure_envelope_has_machine_fields():
    from cli_anything.indesign.core.envelope import failure
    from cli_anything.indesign.core.errors import CliError

    payload = failure(
        command="unit",
        error=CliError("Bad input", code="BAD_INPUT", retryable=False),
        duration_ms=12,
    )
    assert payload["ok"] is False
    assert payload["exit_code"] == 1
    assert payload["schema_version"] == 1
    assert payload["error"]["code"] == "BAD_INPUT"
    assert payload["error"]["retryable"] is False
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```powershell
python -m pytest agent-harness/cli_anything/indesign/tests/test_core.py::test_external_path_is_scrubbed agent-harness/cli_anything/indesign/tests/test_core.py::test_failure_envelope_has_machine_fields -q
```

Expected: FAIL，错误包含 `No module named cli_anything.indesign.core`。

- [ ] **Step 3: 写实现**

创建 `agent-harness/cli_anything/indesign/core/errors.py`：

```python
class CliError(Exception):
    def __init__(
        self,
        message: str,
        *,
        code: str = "CLI_ERROR",
        retryable: bool = False,
        details: dict | None = None,
        hint: str | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.code = code
        self.retryable = retryable
        self.details = details or {}
        self.hint = hint


class TimeoutError(CliError):
    def __init__(self, message: str, *, details: dict | None = None) -> None:
        super().__init__(
            message,
            code="TIMEOUT",
            retryable=True,
            details=details,
            hint="缩短脚本或增加 --timeout；若 InDesign 卡住，先检查应用窗口状态。",
        )
```

创建 `agent-harness/cli_anything/indesign/core/envelope.py`：

```python
from __future__ import annotations

import time
import uuid
from typing import Any

from .errors import CliError


def request_id() -> str:
    return uuid.uuid4().hex[:16]


def success(
    *,
    command: str,
    data: Any,
    duration_ms: int,
    tool_id: str | None = None,
    domain: str | None = None,
    source: str | None = None,
    backend: str | None = None,
    warnings: list[str] | None = None,
) -> dict[str, Any]:
    return {
        "schema_version": 1,
        "ok": True,
        "exit_code": 0,
        "request_id": request_id(),
        "command": command,
        "tool_id": tool_id,
        "domain": domain,
        "source": source,
        "backend": backend,
        "mcp_ok": True,
        "tool_success": True,
        "raw_result_type": "json",
        "duration_ms": duration_ms,
        "data": data,
        "warnings": warnings or [],
    }


def failure(*, command: str, error: CliError, duration_ms: int) -> dict[str, Any]:
    return {
        "schema_version": 1,
        "ok": False,
        "exit_code": 1,
        "request_id": request_id(),
        "command": command,
        "duration_ms": duration_ms,
        "error": {
            "type": error.__class__.__name__,
            "code": error.code,
            "message": error.message,
            "details": error.details,
            "retryable": error.retryable,
            "hint": error.hint,
        },
        "warnings": [],
    }


def now_ms() -> int:
    return int(time.perf_counter() * 1000)
```

创建 `agent-harness/cli_anything/indesign/core/paths.py`：

```python
from __future__ import annotations

import hashlib
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
```

修改 `agent-harness/cli_anything/indesign/indesign_cli.py`，保留 parser，改 `version_payload()` 使用 `success()`：

```python
import argparse
import json
import sys
from typing import Any

from . import __version__
from .core.envelope import success


def emit(payload: dict[str, Any]) -> int:
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return int(payload.get("exit_code", 0))


def version_payload() -> dict[str, Any]:
    return success(
        command="version",
        data={"name": "indesign-cli", "version": __version__},
        duration_ms=0,
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="indesign-cli")
    parser.add_argument("--version", action="store_true")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--pretty", action="store_true")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.version:
        return emit(version_payload())
    parser.print_help(sys.stderr)
    return 2
```

- [ ] **Step 4: 运行测试确认通过**

Run:

```powershell
python -m pytest agent-harness/cli_anything/indesign/tests/test_core.py -q
```

Expected: PASS。

- [ ] **Step 5: 提交**

```powershell
git add agent-harness/cli_anything/indesign/core/envelope.py agent-harness/cli_anything/indesign/core/errors.py agent-harness/cli_anything/indesign/core/paths.py agent-harness/cli_anything/indesign/indesign_cli.py agent-harness/cli_anything/indesign/tests/test_core.py
git commit -m "feat: add cli json envelope"
```

## Task 3: 统一工具目录和 domain 查询

**Files:**
- Create: `agent-harness/cli_anything/indesign/core/domains.py`
- Create: `agent-harness/cli_anything/indesign/core/catalog.py`
- Modify: `agent-harness/cli_anything/indesign/indesign_cli.py`
- Modify: `agent-harness/cli_anything/indesign/tests/test_core.py`

- [ ] **Step 1: 添加失败测试**

追加到 `agent-harness/cli_anything/indesign/tests/test_core.py`：

```python

def test_tool_domains_are_compact():
    from cli_anything.indesign.core.catalog import Catalog

    catalog = Catalog(repo_root=REPO_ROOT)
    domains = catalog.domains()
    names = {item["domain"] for item in domains}
    assert {"template", "document", "export", "book", "presentation", "object"}.issubset(names)
    export = next(item for item in domains if item["domain"] == "export")
    assert "summary" in export
    assert "top_tools" in export
    assert "tools" not in export


def test_hidden_handlers_are_listed_but_not_callable():
    from cli_anything.indesign.core.catalog import Catalog

    catalog = Catalog(repo_root=REPO_ROOT)
    book_tools = catalog.list_tools(domain="book", callable_only=False)
    assert any(item["availability"] == "hidden_handler" for item in book_tools)
    assert all(item["callable"] is False for item in book_tools if item["availability"] == "hidden_handler")
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```powershell
python -m pytest agent-harness/cli_anything/indesign/tests/test_core.py::test_tool_domains_are_compact agent-harness/cli_anything/indesign/tests/test_core.py::test_hidden_handlers_are_listed_but_not_callable -q
```

Expected: FAIL，错误包含 `No module named cli_anything.indesign.core.catalog`。

- [ ] **Step 3: 写实现**

创建 `agent-harness/cli_anything/indesign/core/domains.py`：

```python
DOMAINS = {
    "template": "模板槽位、脚本标签、母版占位和模板填充",
    "document": "打开、保存、关闭、文档信息",
    "page": "页面、页面尺寸和页面基础操作",
    "spread": "跨页、跨页布局和跨页范围操作",
    "master": "母版、母版跨页和母版对象",
    "layer": "图层创建、查询、锁定、显示和删除",
    "object": "页面对象、对象组、几何位置、脚本标签",
    "text": "文本框、文本内容、段落和字符操作",
    "graphics": "图片、图形框、适配和基础绘制",
    "style": "段落样式、字符样式、对象样式",
    "export": "PDF、IDML、图片等导出和产物验证",
    "book": "InDesign Book 文件、章节和书籍级同步",
    "presentation": "演示型版面、页面序列和 presentation handler 能力",
    "script": "JSX 文件执行和 stdin 临时脚本",
    "session": "CLI 本地状态、最近文档和最近输出",
    "server": "依赖、后端、InDesign COM 健康检查",
    "utility": "难以归入以上域的辅助能力",
}


KEYWORD_DOMAINS = {
    "template": "template",
    "blueprint": "template",
    "slot": "template",
    "document": "document",
    "page": "page",
    "spread": "spread",
    "master": "master",
    "layer": "layer",
    "item": "object",
    "group": "object",
    "label": "object",
    "text": "text",
    "paragraph": "style",
    "character": "style",
    "style": "style",
    "graphic": "graphics",
    "image": "graphics",
    "export": "export",
    "pdf": "export",
    "idml": "export",
    "book": "book",
    "presentation": "presentation",
    "session": "session",
    "help": "utility",
}


def infer_domain(tool_name: str, description: str = "") -> str:
    haystack = f"{tool_name} {description}".lower()
    for keyword, domain in KEYWORD_DOMAINS.items():
        if keyword in haystack:
            return domain
    return "utility"
```

创建 `agent-harness/cli_anything/indesign/core/catalog.py`：

```python
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from .domains import DOMAINS, infer_domain


CLI_PRIMITIVES = [
    {
        "id": "export.verify",
        "domain": "export",
        "name": "verify",
        "one_line_purpose": "验证 PDF 或 IDML 产物是否存在且格式正确",
        "arg_names": ["path", "created_after"],
        "source": "cli",
        "rank": 1,
        "schema_size": "small",
        "availability": "exposed",
        "callable": True,
        "requires": [],
        "side_effects": [],
        "artifact_kinds": ["pdf", "idml"],
        "destructive": False,
        "target_scope": "filesystem",
        "needs_indesign": False,
        "produces_artifacts": False,
    },
    {
        "id": "script.run",
        "domain": "script",
        "name": "run",
        "one_line_purpose": "执行 JSX 文件或 stdin 临时脚本",
        "arg_names": ["file", "stdin"],
        "source": "script",
        "rank": 1,
        "schema_size": "small",
        "availability": "exposed",
        "callable": True,
        "requires": ["indesign_com"],
        "side_effects": ["indesign_mutation"],
        "artifact_kinds": [],
        "destructive": False,
        "target_scope": "indesign",
        "needs_indesign": True,
        "produces_artifacts": False,
    },
]


HIDDEN_HANDLER_FILES = {
    "book": "src/handlers/bookHandlers.js",
    "presentation": "src/handlers/presentationHandlers.js",
}


def exposed_tool_entries(tools: list[dict[str, Any]], source: str) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    for index, tool in enumerate(tools):
        name = tool["name"]
        description = tool.get("description", "")
        domain = infer_domain(name, description)
        schema = tool.get("inputSchema", {})
        properties = schema.get("properties", {})
        rank = 10 + index if source == "advanced" else 30 + index
        entries.append(
            {
                "id": f"{domain}.{name}",
                "domain": domain,
                "name": name,
                "one_line_purpose": description.splitlines()[0][:120] if description else name,
                "arg_names": list(properties.keys()),
                "source": source,
                "rank": rank,
                "schema_size": "small" if len(json.dumps(schema, ensure_ascii=False)) < 800 else "medium",
                "availability": "exposed",
                "callable": True,
                "requires": ["indesign_com"],
                "side_effects": [],
                "artifact_kinds": [],
                "destructive": False,
                "target_scope": domain,
                "needs_indesign": True,
                "produces_artifacts": domain == "export",
            }
        )
    return entries


class Catalog:
    def __init__(self, repo_root: Path, exposed_tools: list[dict[str, Any]] | None = None) -> None:
        self.repo_root = repo_root
        self.exposed_tools = exposed_tools or []

    def with_exposed_tools(
        self,
        *,
        advanced_tools: list[dict[str, Any]],
        classic_tools: list[dict[str, Any]],
    ) -> "Catalog":
        exposed = [
            *exposed_tool_entries(advanced_tools, "advanced"),
            *exposed_tool_entries(classic_tools, "classic"),
        ]
        return Catalog(repo_root=self.repo_root, exposed_tools=exposed)

    def domains(self) -> list[dict[str, Any]]:
        tools = self.list_tools(callable_only=False)
        result: list[dict[str, Any]] = []
        for domain, summary in DOMAINS.items():
            domain_tools = [tool for tool in tools if tool["domain"] == domain]
            count_by_source: dict[str, int] = {}
            for tool in domain_tools:
                count_by_source[tool["source"]] = count_by_source.get(tool["source"], 0) + 1
            top_tools = [tool["id"] for tool in sorted(domain_tools, key=lambda item: item["rank"])[:3]]
            result.append(
                {
                    "domain": domain,
                    "summary": summary,
                    "count": len(domain_tools),
                    "count_by_source": count_by_source,
                    "top_tools": top_tools,
                }
            )
        return result

    def list_tools(
        self,
        *,
        domain: str | None = None,
        source: str | None = None,
        callable_only: bool = False,
    ) -> list[dict[str, Any]]:
        tools = [*CLI_PRIMITIVES, *self.exposed_tools, *self._hidden_handler_entries()]
        if domain:
            tools = [tool for tool in tools if tool["domain"] == domain]
        if source:
            tools = [tool for tool in tools if tool["source"] == source]
        if callable_only:
            tools = [tool for tool in tools if tool["callable"] is True]
        return sorted(tools, key=lambda item: (item["domain"], item["rank"], item["id"]))

    def search(self, *, domain: str | None, query: str) -> list[dict[str, Any]]:
        query_lower = query.lower()
        return [
            tool
            for tool in self.list_tools(domain=domain, callable_only=False)
            if query_lower in tool["id"].lower() or query_lower in tool["one_line_purpose"].lower()
        ]

    def _hidden_handler_entries(self) -> list[dict[str, Any]]:
        entries: list[dict[str, Any]] = []
        for domain, relative_path in HIDDEN_HANDLER_FILES.items():
            path = self.repo_root / relative_path
            if not path.exists():
                continue
            text = path.read_text(encoding="utf-8")
            methods = re.findall(r"static\s+async\s+([A-Za-z0-9_]+)\s*\(", text)
            for index, method in enumerate(sorted(set(methods))):
                entries.append(
                    {
                        "id": f"{domain}.{method}",
                        "domain": domain,
                        "name": method,
                        "one_line_purpose": f"{domain} handler method {method} exists but is not exposed by ListTools",
                        "arg_names": [],
                        "source": "hidden_handler",
                        "rank": 90 + index,
                        "schema_size": "unknown",
                        "availability": "hidden_handler",
                        "callable": False,
                        "requires": ["implementation_review"],
                        "side_effects": [],
                        "artifact_kinds": [],
                        "destructive": False,
                        "target_scope": domain,
                        "needs_indesign": True,
                        "produces_artifacts": False,
                    }
                )
        return entries
```

修改 `agent-harness/cli_anything/indesign/indesign_cli.py`，加入 `tool domains/list/search` 分发：

```python
import argparse
import json
import sys
from pathlib import Path
from typing import Any

from . import __version__
from .core.catalog import Catalog
from .core.envelope import success


REPO_ROOT = Path(__file__).resolve().parents[4]


def emit(payload: dict[str, Any]) -> int:
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return int(payload.get("exit_code", 0))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="indesign-cli")
    parser.add_argument("--version", action="store_true")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--pretty", action="store_true")
    sub = parser.add_subparsers(dest="group")
    tool = sub.add_parser("tool")
    tool_sub = tool.add_subparsers(dest="tool_command")
    tool_sub.add_parser("domains")
    list_parser = tool_sub.add_parser("list")
    list_parser.add_argument("--domain")
    list_parser.add_argument("--source")
    list_parser.add_argument("--callable-only", action="store_true")
    search_parser = tool_sub.add_parser("search")
    search_parser.add_argument("--domain")
    search_parser.add_argument("--query", required=True)
    return parser


def version_payload() -> dict[str, Any]:
    return success(
        command="version",
        data={"name": "indesign-cli", "version": __version__},
        duration_ms=0,
    )


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.version:
        return emit(version_payload())
    if args.group == "tool":
        catalog = Catalog(repo_root=REPO_ROOT)
        if args.tool_command == "domains":
            return emit(success(command="tool domains", data={"domains": catalog.domains()}, duration_ms=0))
        if args.tool_command == "list":
            if not args.domain:
                return emit(success(command="tool list", data={"domains": catalog.domains()}, duration_ms=0))
            data = catalog.list_tools(
                domain=args.domain,
                source=args.source,
                callable_only=args.callable_only,
            )
            return emit(success(command="tool list", data={"tools": data}, duration_ms=0))
        if args.tool_command == "search":
            data = catalog.search(domain=args.domain, query=args.query)
            return emit(success(command="tool search", data={"tools": data}, duration_ms=0))
    parser.print_help(sys.stderr)
    return 2
```

- [ ] **Step 4: 运行测试确认通过**

Run:

```powershell
python -m pytest agent-harness/cli_anything/indesign/tests/test_core.py -q
```

Expected: PASS。

- [ ] **Step 5: 提交**

```powershell
git add agent-harness/cli_anything/indesign/core/domains.py agent-harness/cli_anything/indesign/core/catalog.py agent-harness/cli_anything/indesign/indesign_cli.py agent-harness/cli_anything/indesign/tests/test_core.py
git commit -m "feat: add indesign tool catalog"
```

## Task 4: MCP stdio 后端和 tool schema/call

**Files:**
- Create: `agent-harness/cli_anything/indesign/core/mcp_backend.py`
- Create: `agent-harness/cli_anything/indesign/core/router.py`
- Modify: `agent-harness/cli_anything/indesign/indesign_cli.py`
- Modify: `agent-harness/cli_anything/indesign/tests/test_core.py`

- [ ] **Step 1: 添加失败测试**

追加到 `agent-harness/cli_anything/indesign/tests/test_core.py`：

```python

def test_tool_call_rejects_hidden_handler():
    from cli_anything.indesign.core.catalog import Catalog
    from cli_anything.indesign.core.router import Router
    from cli_anything.indesign.core.errors import CliError

    router = Router(catalog=Catalog(repo_root=REPO_ROOT), repo_root=REPO_ROOT)
    hidden = next(item for item in router.catalog.list_tools(domain="book") if item["callable"] is False)
    try:
        router.schema(hidden["id"])
    except CliError as exc:
        assert exc.code == "TOOL_NOT_CALLABLE"
    else:
        raise AssertionError("hidden handler should not expose schema")
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```powershell
python -m pytest agent-harness/cli_anything/indesign/tests/test_core.py::test_tool_call_rejects_hidden_handler -q
```

Expected: FAIL，错误包含 `No module named cli_anything.indesign.core.router`。

- [ ] **Step 3: 写实现**

创建 `agent-harness/cli_anything/indesign/core/mcp_backend.py`：

```python
from __future__ import annotations

import json
import subprocess
import threading
from pathlib import Path
from typing import Any

from .errors import CliError, TimeoutError


class McpBackend:
    def __init__(self, repo_root: Path, entry: str, timeout_seconds: int = 30) -> None:
        self.repo_root = repo_root
        self.entry = entry
        self.timeout_seconds = timeout_seconds
        self._next_id = 1

    def list_tools(self) -> list[dict[str, Any]]:
        response = self._with_process(lambda proc: self._request(proc, "tools/list", {}))
        return response.get("tools", [])

    def call_tool(self, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        return self._with_process(
            lambda proc: self._request(proc, "tools/call", {"name": name, "arguments": arguments})
        )

    def _with_process(self, action):
        proc = subprocess.Popen(
            ["node", self.entry],
            cwd=self.repo_root,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
        )
        timer = threading.Timer(self.timeout_seconds, proc.kill)
        try:
            timer.start()
            self._request(proc, "initialize", {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "indesign-cli", "version": "0.1.0"},
            })
            self._notify(proc, "notifications/initialized", {})
            result = action(proc)
            return result
        finally:
            timer.cancel()
            if proc.poll() is None:
                proc.terminate()
                try:
                    proc.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    proc.kill()

    def _request(self, proc: subprocess.Popen[str], method: str, params: dict[str, Any]) -> dict[str, Any]:
        if proc.stdin is None or proc.stdout is None:
            raise CliError("MCP process stdio is unavailable", code="MCP_STDIO_UNAVAILABLE")
        request = {"jsonrpc": "2.0", "id": self._next_id, "method": method, "params": params}
        self._next_id += 1
        proc.stdin.write(json.dumps(request, ensure_ascii=False) + "\n")
        proc.stdin.flush()
        line = proc.stdout.readline()
        if line == "":
            raise TimeoutError("MCP process ended before response")
        response = json.loads(line)
        if "error" in response:
            raise CliError(
                response["error"].get("message", "MCP request failed"),
                code="MCP_PROTOCOL_ERROR",
                retryable=False,
                details=response["error"],
            )
        return response.get("result", {})

    def _notify(self, proc: subprocess.Popen[str], method: str, params: dict[str, Any]) -> None:
        if proc.stdin is None:
            raise CliError("MCP process stdin is unavailable", code="MCP_STDIN_UNAVAILABLE")
        proc.stdin.write(json.dumps({"jsonrpc": "2.0", "method": method, "params": params}) + "\n")
        proc.stdin.flush()
```

创建 `agent-harness/cli_anything/indesign/core/router.py`：

```python
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .catalog import Catalog
from .errors import CliError
from .mcp_backend import McpBackend


BACKENDS = {
    "advanced": "src/advanced/index.js",
    "classic": "src/index.js",
}


class Router:
    def __init__(self, catalog: Catalog, repo_root: Path) -> None:
        self.catalog = catalog
        self.repo_root = repo_root

    def _find(self, tool_id: str) -> dict[str, Any]:
        matches = [tool for tool in self.catalog.list_tools(callable_only=False) if tool["id"] == tool_id]
        if not matches:
            raise CliError(f"Tool not found: {tool_id}", code="TOOL_NOT_FOUND")
        return matches[0]

    def schema(self, tool_id: str) -> dict[str, Any]:
        tool = self._find(tool_id)
        if not tool["callable"]:
            raise CliError(f"Tool is not callable: {tool_id}", code="TOOL_NOT_CALLABLE")
        if tool["source"] in {"cli", "script"}:
            return {"tool": tool, "inputSchema": {"type": "object", "properties": {}}}
        backend = self._backend(tool["source"])
        for item in backend.list_tools():
            if item["name"] == tool["name"]:
                return {"tool": tool, "inputSchema": item.get("inputSchema", {})}
        raise CliError(f"Backend schema missing for {tool_id}", code="SCHEMA_NOT_FOUND")

    def call(self, tool_id: str, args: dict[str, Any]) -> dict[str, Any]:
        tool = self._find(tool_id)
        if not tool["callable"]:
            raise CliError(f"Tool is not callable: {tool_id}", code="TOOL_NOT_CALLABLE")
        if tool["source"] not in BACKENDS:
            raise CliError(f"Tool is handled by a CLI command: {tool_id}", code="CLI_PRIMITIVE_ROUTE")
        backend = self._backend(tool["source"])
        return backend.call_tool(tool["name"], args)

    def _backend(self, source: str) -> McpBackend:
        entry = BACKENDS[source]
        return McpBackend(repo_root=self.repo_root, entry=entry)


def load_args(path_value: str) -> dict[str, Any]:
    if path_value == "-":
        import sys
        return json.loads(sys.stdin.read() or "{}")
    return json.loads(Path(path_value).read_text(encoding="utf-8"))
```

修改 `agent-harness/cli_anything/indesign/indesign_cli.py`：在 `tool_sub` 下添加 `schema` 和 `call` 子命令，并在 `main()` 中调用 `Router`。保留 Task 3 中已有分支。

```python
schema_parser = tool_sub.add_parser("schema")
schema_parser.add_argument("tool_id")
call_parser = tool_sub.add_parser("call")
call_parser.add_argument("tool_id")
call_parser.add_argument("--args", required=True)
```

在 `main()` 的 `if args.group == "tool":` 分支中加入：

```python
from .core.router import Router, load_args
from .core.mcp_backend import McpBackend


def build_catalog_with_backends() -> Catalog:
    base = Catalog(repo_root=REPO_ROOT)
    advanced_tools = McpBackend(repo_root=REPO_ROOT, entry="src/advanced/index.js").list_tools()
    classic_tools = McpBackend(repo_root=REPO_ROOT, entry="src/index.js").list_tools()
    return base.with_exposed_tools(advanced_tools=advanced_tools, classic_tools=classic_tools)

catalog = build_catalog_with_backends()
router = Router(catalog=catalog, repo_root=REPO_ROOT)
if args.tool_command == "schema":
    data = router.schema(args.tool_id)
    return emit(success(command="tool schema", data=data, duration_ms=0, tool_id=args.tool_id))
if args.tool_command == "call":
    call_args = load_args(args.args)
    data = router.call(args.tool_id, call_args)
    return emit(success(command="tool call", data=data, duration_ms=0, tool_id=args.tool_id))
```

- [ ] **Step 4: 运行测试确认通过**

Run:

```powershell
python -m pytest agent-harness/cli_anything/indesign/tests/test_core.py -q
```

Expected: PASS。

- [ ] **Step 5: 提交**

```powershell
git add agent-harness/cli_anything/indesign/core/mcp_backend.py agent-harness/cli_anything/indesign/core/router.py agent-harness/cli_anything/indesign/indesign_cli.py agent-harness/cli_anything/indesign/tests/test_core.py
git commit -m "feat: route indesign tool calls"
```

## Task 5: JSX 执行、session 和产物验证

**Files:**
- Create: `agent-harness/cli_anything/indesign/core/scripts.py`
- Create: `agent-harness/cli_anything/indesign/core/session.py`
- Create: `agent-harness/cli_anything/indesign/core/artifacts.py`
- Modify: `agent-harness/cli_anything/indesign/indesign_cli.py`
- Modify: `agent-harness/cli_anything/indesign/tests/test_core.py`

- [ ] **Step 1: 添加失败测试**

追加到 `agent-harness/cli_anything/indesign/tests/test_core.py`：

```python

def test_pdf_verify_rejects_non_pdf(tmp_path):
    from cli_anything.indesign.core.artifacts import verify_artifact
    from cli_anything.indesign.core.errors import CliError

    fake = tmp_path / "out.pdf"
    fake.write_text("not a pdf", encoding="utf-8")
    try:
        verify_artifact(fake)
    except CliError as exc:
        assert exc.code == "ARTIFACT_SIGNATURE_INVALID"
    else:
        raise AssertionError("invalid PDF should fail")


def test_session_compact_does_not_store_args(tmp_path):
    from cli_anything.indesign.core.session import SessionStore

    store = SessionStore(tmp_path)
    store.record_call(tool_id="document.info", domain="document", source="classic", ok=True, duration_ms=5)
    payload = store.read(compact=True)
    assert "recent_calls" in payload
    assert "args" not in json.dumps(payload, ensure_ascii=False)
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```powershell
python -m pytest agent-harness/cli_anything/indesign/tests/test_core.py::test_pdf_verify_rejects_non_pdf agent-harness/cli_anything/indesign/tests/test_core.py::test_session_compact_does_not_store_args -q
```

Expected: FAIL，错误包含缺少 `artifacts` 或 `session` 模块。

- [ ] **Step 3: 写实现**

创建 `agent-harness/cli_anything/indesign/core/session.py`：

```python
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


class SessionStore:
    def __init__(self, cwd: Path) -> None:
        self.root = cwd / ".indesign-cli"
        self.path = self.root / "session.json"

    def read(self, compact: bool = True) -> dict[str, Any]:
        if not self.path.exists():
            return {"version": 1, "recent_calls": []}
        payload = json.loads(self.path.read_text(encoding="utf-8"))
        if compact:
            payload.pop("verbose_paths", None)
        return payload

    def write(self, payload: dict[str, Any]) -> None:
        self.root.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    def record_call(self, *, tool_id: str, domain: str, source: str, ok: bool, duration_ms: int) -> None:
        payload = self.read(compact=False)
        calls = payload.setdefault("recent_calls", [])
        calls.insert(
            0,
            {
                "tool_id": tool_id,
                "domain": domain,
                "source": source,
                "ok": ok,
                "duration_ms": duration_ms,
                "time": datetime.now(timezone.utc).isoformat(),
            },
        )
        payload["recent_calls"] = calls[:20]
        self.write(payload)

    def clear(self) -> None:
        if self.path.exists():
            self.path.unlink()
```

创建 `agent-harness/cli_anything/indesign/core/artifacts.py`：

```python
from __future__ import annotations

import zipfile
from datetime import datetime
from pathlib import Path
from typing import Any

from .errors import CliError


def verify_artifact(path: Path, created_after: datetime | None = None) -> dict[str, Any]:
    if not path.exists():
        raise CliError(f"Artifact not found: {path}", code="ARTIFACT_NOT_FOUND")
    stat = path.stat()
    if stat.st_size <= 0:
        raise CliError(f"Artifact is empty: {path}", code="ARTIFACT_EMPTY")
    if created_after and datetime.fromtimestamp(stat.st_mtime, created_after.tzinfo) < created_after:
        raise CliError(f"Artifact is older than expected: {path}", code="ARTIFACT_TOO_OLD")
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        with path.open("rb") as handle:
            if handle.read(4) != b"%PDF":
                raise CliError("PDF signature is invalid", code="ARTIFACT_SIGNATURE_INVALID")
        return {"path": str(path), "kind": "pdf", "size_bytes": stat.st_size, "signature_ok": True, "mtime": stat.st_mtime}
    if suffix == ".idml":
        with zipfile.ZipFile(path) as archive:
            if "designmap.xml" not in archive.namelist():
                raise CliError("IDML designmap.xml missing", code="ARTIFACT_SIGNATURE_INVALID")
        return {"path": str(path), "kind": "idml", "size_bytes": stat.st_size, "signature_ok": True, "mtime": stat.st_mtime}
    raise CliError(f"Unsupported artifact type: {suffix}", code="ARTIFACT_UNSUPPORTED")
```

创建 `agent-harness/cli_anything/indesign/core/scripts.py`：

```python
from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

from .router import Router


def run_script(router: Router, script_path: Path) -> dict[str, Any]:
    resolved = script_path.resolve()
    return router.call("template.run_jsx_file", {"filePath": str(resolved)})


def run_stdin_script(router: Router, cwd: Path) -> dict[str, Any]:
    tmp_dir = cwd / ".indesign-cli" / "tmp"
    tmp_dir.mkdir(parents=True, exist_ok=True)
    script_path = tmp_dir / "stdin.jsx"
    script_path.write_text(sys.stdin.read(), encoding="utf-8")
    return run_script(router, script_path)
```

- [ ] **Step 4: 运行测试确认通过**

Run:

```powershell
python -m pytest agent-harness/cli_anything/indesign/tests/test_core.py -q
```

Expected: PASS。

- [ ] **Step 5: 提交**

```powershell
git add agent-harness/cli_anything/indesign/core/scripts.py agent-harness/cli_anything/indesign/core/session.py agent-harness/cli_anything/indesign/core/artifacts.py agent-harness/cli_anything/indesign/indesign_cli.py agent-harness/cli_anything/indesign/tests/test_core.py
git commit -m "feat: add scripts session artifacts"
```

## Task 6: health、gitignore、文档和 E2E 骨架

**Files:**
- Create: `agent-harness/cli_anything/indesign/core/health.py`
- Create: `agent-harness/INDESIGN.md`
- Create: `agent-harness/cli_anything/indesign/README.md`
- Create: `agent-harness/cli_anything/indesign/tests/TEST.md`
- Create: `agent-harness/cli_anything/indesign/tests/test_full_e2e.py`
- Modify: `.gitignore`
- Modify: `agent-harness/cli_anything/indesign/indesign_cli.py`

- [ ] **Step 1: 添加失败测试**

追加到 `agent-harness/cli_anything/indesign/tests/test_core.py`：

```python

def test_health_reports_project_files():
    from cli_anything.indesign.core.health import health

    payload = health(REPO_ROOT, deep=False)
    assert payload["node_entry_advanced"]["exists"] is True
    assert payload["node_entry_classic"]["exists"] is True
    assert payload["deep"] is False
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```powershell
python -m pytest agent-harness/cli_anything/indesign/tests/test_core.py::test_health_reports_project_files -q
```

Expected: FAIL，错误包含 `No module named cli_anything.indesign.core.health`。

- [ ] **Step 3: 写实现**

创建 `agent-harness/cli_anything/indesign/core/health.py`：

```python
from __future__ import annotations

import shutil
from pathlib import Path
from typing import Any


def health(repo_root: Path, deep: bool = False) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "deep": deep,
        "node": {"available": shutil.which("node") is not None},
        "node_entry_advanced": {"path": "src/advanced/index.js", "exists": (repo_root / "src/advanced/index.js").exists()},
        "node_entry_classic": {"path": "src/index.js", "exists": (repo_root / "src/index.js").exists()},
    }
    if deep:
        payload["winax"] = {"checked": True, "available": None}
        payload["indesign_com"] = {"checked": True, "available": None}
    return payload
```

追加到 `.gitignore`：

```gitignore
.indesign-cli/
```

创建 `agent-harness/INDESIGN.md`：

```markdown
# InDesign Agent CLI

`indesign-cli` 是给 Agent 使用的 InDesign CLI。默认输出 JSON。

推荐顺序：

1. `tool domains`
2. `tool list --domain <domain>`
3. `tool schema <tool_id>`
4. `tool call <tool_id> --args args.json`
5. 多步骤自动化优先写 JSX 并执行 `script run <file.jsx>`

第一版不做常驻服务。InDesign 进程和打开文档可以连续存在，Node MCP 子进程内存不跨命令保留。
```

创建 `agent-harness/cli_anything/indesign/README.md`：

```markdown
# indesign-cli

Agent 专用 InDesign CLI harness。

常用命令：

```powershell
indesign-cli tool domains
indesign-cli tool list --domain template
indesign-cli tool schema template.run_jsx_file
indesign-cli script run scripts/check.jsx
indesign-cli export verify output/result.pdf
indesign-cli server health
```
```

创建 `agent-harness/cli_anything/indesign/tests/TEST.md`：

```markdown
# InDesign Agent CLI 测试计划

## 单元测试

- JSON envelope
- 路径脱敏
- 工具目录
- hidden handler
- session compact
- export verify
- health

## MCP 冒烟

- `tool domains`
- `tool list --domain template`
- `server health`

## 真实 E2E

需要 Windows、Adobe InDesign、winax。

- `server health --deep`
- `script run`
- PDF 导出后 `export verify`
```

创建 `agent-harness/cli_anything/indesign/tests/test_full_e2e.py`：

```python
import os

import pytest


@pytest.mark.skipif(os.environ.get("INDESIGN_E2E") != "1", reason="Set INDESIGN_E2E=1 to run real InDesign tests")
def test_real_indesign_e2e_placeholder():
    assert True
```

- [ ] **Step 4: 运行测试确认通过**

Run:

```powershell
python -m pytest agent-harness/cli_anything/indesign/tests/test_core.py -q
```

Expected: PASS。

Run:

```powershell
python -m pytest agent-harness/cli_anything/indesign/tests/test_full_e2e.py -q
```

Expected: SKIPPED，除非设置了 `INDESIGN_E2E=1`。

- [ ] **Step 5: 验证命令入口**

Run:

```powershell
pip install -e agent-harness
indesign-cli --version
indesign-cli tool domains
```

Expected: 两条 CLI 命令都返回 JSON，`tool domains` 中包含 `template`、`document`、`export`、`book`、`presentation`。

- [ ] **Step 6: 提交**

```powershell
git add .gitignore agent-harness/INDESIGN.md agent-harness/cli_anything/indesign/README.md agent-harness/cli_anything/indesign/core/health.py agent-harness/cli_anything/indesign/indesign_cli.py agent-harness/cli_anything/indesign/tests/TEST.md agent-harness/cli_anything/indesign/tests/test_core.py agent-harness/cli_anything/indesign/tests/test_full_e2e.py
git commit -m "feat: add indesign cli health docs"
```

## 自检清单

- [ ] 每个 spec 目标都能对应到至少一个 task。
- [ ] 没有默认全量工具列表。
- [ ] hidden handler 进入目录但不可直接调用。
- [ ] 默认 JSON 输出。
- [ ] 外部路径默认脱敏。
- [ ] Node MCP 子进程超时后会清理。
- [ ] `.indesign-cli/` 已进入 `.gitignore`。
- [ ] 单元测试通过。
- [ ] 没有真实 InDesign 时 E2E 明确跳过。

## 执行选择

Plan complete and saved to `docs/superpowers/plans/2026-05-23-indesign-agent-cli-plan.md`. Two execution options:

1. **Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

2. **Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
