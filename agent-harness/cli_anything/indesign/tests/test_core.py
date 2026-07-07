import io
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[4]
HARNESS_ROOT = REPO_ROOT / "agent-harness"
FAKE_PLUGIN_ROOT = HARNESS_ROOT / "cli_anything" / "indesign" / "tests" / "fixtures" / "plugins" / "fake-html-plugin"
sys.path.insert(0, str(HARNESS_ROOT))

def run_module(*args: str, cwd: Path = REPO_ROOT, env_overrides: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    env["PYTHONPATH"] = str(HARNESS_ROOT)
    env["PYTHONIOENCODING"] = "utf-8"
    if env_overrides:
        env.update(env_overrides)
    return subprocess.run(
        [sys.executable, "-m", "cli_anything.indesign", *args],
        cwd=cwd,
        env=env,
        text=True,
        encoding="utf-8",
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
    assert "cli-anything-indesign" in payload["data"]["aliases"]
    assert payload["data"]["version"]


def test_pyproject_exposes_remote_installable_package_and_console_aliases():
    from cli_anything.indesign import __version__

    pyproject_path = REPO_ROOT / "pyproject.toml"
    assert pyproject_path.exists()
    payload = pyproject_path.read_text(encoding="utf-8")
    assert 'name = "indesign-cli"' in payload
    assert 'authors = [{ name = "Sa" }]' in payload
    assert 'Repository = "https://github.com/zhanglongxiao111/indesign-cli"' in payload
    assert 'indesign-cli = "cli_anything.indesign.indesign_cli:main"' in payload
    assert 'cli-anything-indesign = "cli_anything.indesign.indesign_cli:main"' in payload
    pyproject_version = re.search(r'^version = "([^"]+)"$', payload, flags=re.MULTILINE)
    assert pyproject_version
    assert pyproject_version.group(1) == __version__

    package_json = json.loads((REPO_ROOT / "package.json").read_text(encoding="utf-8"))
    assert package_json["name"] == "indesign-cli"
    assert package_json["version"] == __version__
    assert package_json["author"] == "Sa"


def test_pypi_source_distribution_includes_node_server_assets():
    manifest_path = REPO_ROOT / "MANIFEST.in"
    assert manifest_path.exists()
    manifest = manifest_path.read_text(encoding="utf-8")
    assert "include package.json" in manifest
    assert "include package-lock.json" in manifest
    assert "recursive-include src *" in manifest
    assert "recursive-include skills *" in manifest
    assert "prune agent-harness/cli_anything/indesign/tests" in manifest

    pyproject = (REPO_ROOT / "pyproject.toml").read_text(encoding="utf-8")
    assert 'requires = ["setuptools>=77", "wheel"]' in pyproject
    assert 'license = "MIT"' in pyproject
    assert 'exclude = ["cli_anything.indesign.tests*"]' in pyproject
    assert '"cli_anything.indesign" = ["skills/*.md", "node/*.mjs", "server/src/core/indesign-tool-registry.json"]' in pyproject


def test_packaging_smoke_embeds_registry_artifact_with_current_hash(tmp_path):
    import tarfile
    import zipfile

    out_dir = tmp_path / "dist"
    result = subprocess.run(
        [sys.executable, "-m", "build", "--sdist", "--wheel", "--outdir", str(out_dir)],
        cwd=REPO_ROOT,
        text=True,
        encoding="utf-8",
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr

    current_artifact = json.loads((REPO_ROOT / "src" / "core" / "indesign-tool-registry.json").read_text(encoding="utf-8"))
    expected_hash = current_artifact["registry_hash"]

    wheel = next(out_dir.glob("*.whl"))
    with zipfile.ZipFile(wheel) as archive:
        wheel_name = "cli_anything/indesign/server/src/core/indesign-tool-registry.json"
        assert wheel_name in archive.namelist()
        wheel_artifact = json.loads(archive.read(wheel_name).decode("utf-8"))
    assert wheel_artifact["registry_hash"] == expected_hash

    sdist = next(out_dir.glob("*.tar.gz"))
    with tarfile.open(sdist) as archive:
        artifact_members = [
            member for member in archive.getmembers()
            if member.name.endswith("/src/core/indesign-tool-registry.json")
        ]
        assert artifact_members
        extracted = archive.extractfile(artifact_members[0])
        assert extracted is not None
        sdist_artifact = json.loads(extracted.read().decode("utf-8"))
    assert sdist_artifact["registry_hash"] == expected_hash


def test_readmes_describe_manual_skill_install_only():
    readme_zh = (REPO_ROOT / "README.md").read_text(encoding="utf-8")
    readme_en = (REPO_ROOT / "README.en.md").read_text(encoding="utf-8")
    harness_readme = (REPO_ROOT / "agent-harness" / "cli_anything" / "indesign" / "README.md").read_text(encoding="utf-8")

    for text in (readme_zh, readme_en, harness_readme):
        assert "indesign-cli skill install" not in text

    assert "skills/indesign-cli/SKILL.md" in readme_zh
    assert ".codex\\skills\\indesign-cli\\SKILL.md" in readme_zh
    assert "手动" in readme_zh

    assert "skills/indesign-cli/SKILL.md" in readme_en
    assert ".codex\\skills\\indesign-cli\\SKILL.md" in readme_en
    assert "manually" in readme_en.lower()

    assert "skills/indesign-cli/SKILL.md" in harness_readme
    assert ".codex\\skills\\indesign-cli\\SKILL.md" in harness_readme


def test_runtime_resolves_server_root_and_packaged_skill():
    from cli_anything.indesign.core.runtime import resolve_server_root, skill_source_path

    server_root = resolve_server_root()
    assert (server_root / "src" / "index.js").exists()
    assert (server_root / "src" / "advanced" / "index.js").exists()
    assert (server_root / "package.json").exists()

    skill_path = skill_source_path()
    assert skill_path.name == "SKILL.md"
    assert skill_path == REPO_ROOT / "skills" / "indesign-cli" / "SKILL.md"
    skill_text = skill_path.read_text(encoding="utf-8")
    assert "name: indesign-cli" in skill_text
    assert "pip install indesign-cli" in skill_text
    assert "server health --deep" in skill_text
    assert "打开或连接 InDesign" in skill_text
    assert "script run --stdin" in skill_text
    assert "不得关闭用户已经打开的 InDesign 文档" in skill_text
    assert "正式成果文件保持打开" in skill_text
    assert "D:\\AI\\html-indesign" not in skill_text
    assert '"templatePath"' not in skill_text
    assert '"values"' not in skill_text
    assert "git+https://github.com" not in skill_text
    assert "cli-anything-indesign" not in skill_text


def test_node_dependency_setup_runs_npm_install_against_server_root(monkeypatch, tmp_path):
    from cli_anything.indesign.core.node_setup import setup_node_dependencies

    calls = []

    def fake_which(name):
        return {"node": "C:\\nodejs\\node.exe", "npm": "C:\\nodejs\\npm.cmd"}.get(name)

    def fake_run(args, **kwargs):
        calls.append((args, kwargs))

        class Result:
            returncode = 0
            stdout = "10.9.0" if args[-1] == "--version" else "installed"
            stderr = ""

        return Result()

    monkeypatch.setattr(shutil, "which", fake_which)
    monkeypatch.setattr(subprocess, "run", fake_run)

    payload = setup_node_dependencies(tmp_path)

    assert calls[-1][0] == ["C:\\nodejs\\npm.cmd", "install"]
    assert calls[-1][1]["cwd"] == tmp_path
    assert payload["ok"] is True
    assert payload["server_root"] == str(tmp_path)
    assert payload["npm_source"] == "path"
    assert payload["toolchain"]["npm"]["version"] == "10.9.0"


def test_node_dependency_setup_falls_back_to_node_bundled_npm(monkeypatch, tmp_path):
    from cli_anything.indesign.core.node_setup import setup_node_dependencies

    node_dir = tmp_path / "nodejs"
    npm_cli = node_dir / "node_modules" / "npm" / "bin" / "npm-cli.js"
    npm_cli.parent.mkdir(parents=True)
    npm_cli.write_text("// npm cli", encoding="utf-8")
    node_path = node_dir / "node.exe"
    node_path.write_text("", encoding="utf-8")
    broken_npm = node_dir / "npm.cmd"
    server_root = tmp_path / "server"
    server_root.mkdir()

    calls = []

    def fake_which(name):
        return {"node": str(node_path), "npm": str(broken_npm)}.get(name)

    def fake_run(args, **kwargs):
        calls.append((args, kwargs))

        class Result:
            stdout = "v22.15.0"
            stderr = ""
            returncode = 1 if args[0] == str(broken_npm) else 0

        return Result()

    monkeypatch.setattr(shutil, "which", fake_which)
    monkeypatch.setattr(subprocess, "run", fake_run)

    payload = setup_node_dependencies(server_root)

    assert payload["npm_source"] == "node_bundled_fallback"
    assert calls[-1][0] == [str(node_path), str(npm_cli), "install"]


def test_node_dependency_setup_fails_with_remediation_when_npm_unusable(monkeypatch, tmp_path):
    from cli_anything.indesign.core.errors import CliError
    from cli_anything.indesign.core.node_setup import setup_node_dependencies

    monkeypatch.setattr(shutil, "which", lambda name: None)

    try:
        setup_node_dependencies(tmp_path)
    except CliError as exc:
        assert exc.code == "NPM_NOT_AVAILABLE"
        assert exc.hint
    else:
        raise AssertionError("expected CliError")


def test_server_root_warnings_flags_long_paths():
    from cli_anything.indesign.core.node_setup import server_root_warnings

    long_root = Path("D:\\") / ("x" * 150)
    warnings = server_root_warnings(long_root)
    assert warnings
    assert "INDESIGN_CLI_SERVER_ROOT" in warnings[0]
    assert server_root_warnings(Path("D:\\srv")) == []


def test_skill_install_is_not_exposed_as_cli_or_tool():
    help_result = run_module("--help")
    assert help_result.returncode == 0
    assert "skill" not in help_result.stdout

    command_result = run_module("skill", "install", "--target", ".")
    assert command_result.returncode != 0

    schema_result = run_module("tool", "schema", "skill.install")
    assert schema_result.returncode == 1
    schema_payload = json.loads(schema_result.stdout)
    assert schema_payload["error"]["code"] == "TOOL_NOT_FOUND"

    domains = json.loads(run_module("tool", "domains").stdout)["data"]
    assert "skill" not in {item["domain"] for item in domains}


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
    assert payload["schema_version"] == 2
    assert payload["error"]["code"] == "BAD_INPUT"
    assert payload["error"]["retryable"] is False
    assert payload["tool_success"] is False
    assert "tool_id" in payload
    assert "data" in payload
    assert payload["state_uncertain"] is False
    assert "next_action" in payload


def assert_failure_envelope(payload, code):
    assert payload["ok"] is False
    assert payload["exit_code"] == 1
    assert payload["error"]["code"] == code
    assert isinstance(payload["request_id"], str)
    assert isinstance(payload["duration_ms"], int)
    assert "state_uncertain" in payload
    assert "next_action" in payload


def test_failure_envelope_copies_uncertain_state_and_next_action():
    from cli_anything.indesign.core.envelope import failure
    from cli_anything.indesign.core.errors import CliError

    payload = failure(
        command="unit",
        error=CliError(
            "Timed out",
            code="TIMEOUT",
            state_uncertain=True,
            next_action="Run session doctor before retrying.",
        ),
        duration_ms=25,
    )

    assert_failure_envelope(payload, "TIMEOUT")
    assert payload["state_uncertain"] is True
    assert payload["next_action"] == "Run session doctor before retrying."


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


def test_catalog_loads_node_backed_tools_from_registry_artifact(monkeypatch):
    from cli_anything.indesign import indesign_cli

    def fail_backend(*args, **kwargs):
        raise AssertionError("catalog must not query MCP backends for Node-backed tools")

    monkeypatch.setattr(indesign_cli.McpBackend, "list_tools", fail_backend)

    catalog, warnings = indesign_cli.build_catalog_with_backends()
    tools = catalog.list_tools(callable_only=True)
    source_counts = {}
    for tool in tools:
        source_counts[tool["source"]] = source_counts.get(tool["source"], 0) + 1

    assert warnings == []
    assert source_counts["classic"] == 114
    assert source_counts["advanced"] == 6
    assert source_counts["hidden_handler"] == 30
    assert source_counts["cli"] == 7
    assert source_counts["cli.primitive"] == 1
    assert source_counts["script"] == 1


def test_registry_artifact_missing_or_stale_is_a_hard_error(tmp_path):
    from cli_anything.indesign.core.catalog import Catalog
    from cli_anything.indesign.core.errors import CliError

    server_root = tmp_path / "server"
    (server_root / "src" / "core").mkdir(parents=True)
    (server_root / "src" / "index.js").write_text("// classic", encoding="utf-8")
    (server_root / "src" / "advanced").mkdir(parents=True)
    (server_root / "src" / "advanced" / "index.js").write_text("// advanced", encoding="utf-8")
    (server_root / "package.json").write_text("{}", encoding="utf-8")

    with pytest.raises(CliError) as missing:
        Catalog(repo_root=server_root)
    assert missing.value.code == "REGISTRY_ARTIFACT_NOT_FOUND"
    assert "node src/core/artifact.js --write" in (missing.value.hint or "")

    artifact = json.loads((REPO_ROOT / "src" / "core" / "indesign-tool-registry.json").read_text(encoding="utf-8"))
    artifact["registry_hash"] = "0" * 64
    (server_root / "src" / "core" / "indesign-tool-registry.json").write_text(json.dumps(artifact), encoding="utf-8")

    with pytest.raises(CliError) as stale:
        Catalog(repo_root=server_root)
    assert stale.value.code == "REGISTRY_ARTIFACT_HASH_MISMATCH"
    assert "node src/core/artifact.js --write" in (stale.value.hint or "")


def test_root_command_missing_still_returns_json_failure():
    result = run_module()
    assert result.returncode == 1
    payload = json.loads(result.stdout)
    assert payload["ok"] is False
    assert payload["error"]["code"] == "COMMAND_REQUIRED"
    assert "usage:" not in result.stdout.lower()


def test_safe_command_ignores_global_flags():
    from cli_anything.indesign.indesign_cli import safe_command

    assert safe_command(["--json", "--pretty", "script", "run"]) == "script run"
    assert safe_command(["--pretty", "tool", "domains"]) == "tool domains"
    assert safe_command(["plugin", "validate"]) == "plugin validate"


def test_script_run_parser_uses_longer_default_timeout():
    from cli_anything.indesign.indesign_cli import build_parser

    parser = build_parser()
    script_args = parser.parse_args(["script", "run", "probe.jsx"])
    assert script_args.timeout == 300

    custom_script_args = parser.parse_args(["script", "run", "probe.jsx", "--timeout", "900"])
    assert custom_script_args.timeout == 900

    tool_args = parser.parse_args(["tool", "call", "script.run", "--args", "args.json", "--timeout", "600"])
    assert tool_args.timeout == 600


def test_invalid_domain_is_actionable():
    result = run_module("tool", "list", "--domain", "not-a-domain")
    assert result.returncode == 1
    payload = json.loads(result.stdout)
    assert payload["ok"] is False
    assert payload["error"]["code"] == "DOMAIN_NOT_FOUND"
    assert payload["error"]["details"]["domain"] == "not-a-domain"
    assert "export" in payload["error"]["details"]["available"]
    assert "tool domains" in payload["error"]["hint"]
    assert "plugin list" in payload["error"]["hint"]


def test_invalid_source_is_actionable():
    result = run_module("tool", "search", "--source", "not-a-source", "--query", "pdf")
    assert result.returncode == 1
    payload = json.loads(result.stdout)
    assert payload["ok"] is False
    assert payload["error"]["code"] == "SOURCE_NOT_FOUND"
    assert payload["error"]["details"]["source"] == "not-a-source"
    assert "advanced" in payload["error"]["details"]["available"]


def test_unknown_tool_hint_points_to_search():
    result = run_module("tool", "schema", "not_a_domain.not_a_tool")
    assert result.returncode == 1
    payload = json.loads(result.stdout)
    assert payload["ok"] is False
    assert payload["error"]["code"] == "TOOL_NOT_FOUND"
    assert "tool search" in payload["error"]["hint"]
    assert "tool domains" in payload["error"]["hint"]


def test_missing_artifact_hint_explains_next_step(tmp_path):
    missing = tmp_path / "missing.pdf"
    result = run_module("export", "verify", str(missing), cwd=tmp_path)
    assert result.returncode == 1
    payload = json.loads(result.stdout)
    assert payload["ok"] is False
    assert payload["error"]["code"] == "ARTIFACT_NOT_FOUND"
    assert "导出" in payload["error"]["hint"]
    assert "当前工作目录" in payload["error"]["hint"]


def test_cli_discovery_commands_return_agent_useful_payloads():
    cases = [
        ("tool", "domains"),
        ("tool",),
        ("tool", "list"),
        ("tool", "list", "--domain", "export", "--callable-only"),
        ("tool", "search", "--domain", "export", "--query", "pdf"),
        ("tool", "schema", "export.verify"),
        ("server", "health"),
        ("server",),
        ("session", "show"),
        ("session",),
    ]
    for case in cases:
        result = run_module(*case)
        assert result.returncode == 0, case
        payload = json.loads(result.stdout)
        assert payload["ok"] is True, case
        assert payload["data"] not in (None, ""), case

    domains = json.loads(run_module("tool", "domains").stdout)["data"]
    export = next(item for item in domains if item["domain"] == "export")
    assert export["summary"]
    assert export["count_by_source"]
    assert export["top_tools"]

    listed = json.loads(run_module("tool", "list", "--domain", "export", "--callable-only").stdout)["data"]
    assert any(item["id"] == "export.verify" for item in listed)
    assert all(item["callable"] is True for item in listed)

    schema = json.loads(run_module("tool", "schema", "export.verify").stdout)["data"]["inputSchema"]
    assert schema["required"] == ["path"]
    assert "path" in schema["properties"]

    health_payload = json.loads(run_module("server", "health").stdout)["data"]
    assert health_payload["indesign_com"]["checked"] is False
    assert health_payload["indesign_com"]["available"] is None


def test_cli_action_commands_return_agent_useful_payloads(tmp_path):
    pdf = tmp_path / "out.pdf"
    pdf.write_bytes(b"%PDF-1.7\n")

    export_result = run_module("export", "verify", str(pdf))
    assert export_result.returncode == 0
    export_payload = json.loads(export_result.stdout)
    assert export_payload["data"]["kind"] == "pdf"
    assert export_payload["data"]["signature_ok"] is True

    args_file = tmp_path / "args.json"
    args_file.write_text(json.dumps({"path": str(pdf)}), encoding="utf-8")
    call_result = run_module("tool", "call", "export.verify", "--args", str(args_file))
    assert call_result.returncode == 0
    call_payload = json.loads(call_result.stdout)
    assert call_payload["tool_id"] == "export.verify"
    assert call_payload["data"]["kind"] == "pdf"

    clear_result = run_module("session", "clear")
    assert clear_result.returncode == 0
    assert json.loads(clear_result.stdout)["data"]["cleared"] is True

    script_result = run_module("script", "run")
    assert script_result.returncode == 1
    script_payload = json.loads(script_result.stdout)
    assert script_payload["error"]["code"] == "SCRIPT_INPUT_REQUIRED"


def test_plugin_validate_accepts_fake_plugin():
    result = run_module("plugin", "validate", str(FAKE_PLUGIN_ROOT))
    assert result.returncode == 0
    payload = json.loads(result.stdout)
    assert payload["ok"] is True
    assert payload["data"]["ok"] is True
    assert payload["data"]["plugin"] == "fake-html-plugin"
    assert payload["data"]["summary"]["tools"] == 3

    manifest_result = run_module("plugin", "validate", str(FAKE_PLUGIN_ROOT / "manifest.json"))
    assert manifest_result.returncode == 0
    assert json.loads(manifest_result.stdout)["data"]["plugin"] == "fake-html-plugin"


def test_plugin_validate_rejects_bad_manifest(tmp_path):
    bad = tmp_path / "bad-plugin"
    bad.mkdir()
    (bad / "manifest.json").write_text(
        json.dumps(
            {
                "schema_version": 1,
                "protocol": "indesign-cli-plugin.v1",
                "id": "bad-plugin",
            }
        ),
        encoding="utf-8",
    )
    result = run_module("plugin", "validate", str(bad))
    assert result.returncode == 1
    payload = json.loads(result.stdout)
    assert payload["ok"] is False
    assert payload["data"]["ok"] is False
    assert any(item["code"] == "PLUGIN_MANIFEST_INVALID" for item in payload["data"]["errors"])


def test_plugin_validate_rejects_missing_document_state_policy(tmp_path):
    bad = tmp_path / "bad-plugin"
    bad.mkdir()
    manifest = json.loads((FAKE_PLUGIN_ROOT / "manifest.json").read_text(encoding="utf-8"))
    manifest.pop("document_state_policy", None)
    (bad / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    (bad / "index.js").write_text((FAKE_PLUGIN_ROOT / "index.js").read_text(encoding="utf-8"), encoding="utf-8")

    result = run_module("plugin", "validate", str(bad))

    assert result.returncode == 1
    payload = json.loads(result.stdout)
    assert payload["data"]["ok"] is False
    assert any(error["code"] == "PLUGIN_MANIFEST_INVALID" for error in payload["data"]["errors"])
    assert any(error["details"].get("field") == "document_state_policy" for error in payload["data"]["errors"])


def test_plugin_validate_rejects_missing_tool_contract_field(tmp_path):
    plugin = tmp_path / "contract-plugin"
    plugin.mkdir()
    manifest = json.loads((FAKE_PLUGIN_ROOT / "manifest.json").read_text(encoding="utf-8"))
    (plugin / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    source = (FAKE_PLUGIN_ROOT / "index.js").read_text(encoding="utf-8")
    source = source.replace("    preconditions: [],\n", "", 1)
    (plugin / "index.js").write_text(source, encoding="utf-8")

    result = run_module("plugin", "validate", str(plugin))

    assert result.returncode == 1
    payload = json.loads(result.stdout)
    assert any(error["details"].get("field") == "preconditions" for error in payload["data"]["errors"])


def test_plugin_validate_rejects_disallowed_host_action(tmp_path):
    plugin = tmp_path / "bad-host-action-plugin"
    plugin.mkdir()
    manifest = json.loads((FAKE_PLUGIN_ROOT / "manifest.json").read_text(encoding="utf-8"))
    manifest["host_actions"] = ["script.run", "server.setup"]
    (plugin / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    (plugin / "index.js").write_text((FAKE_PLUGIN_ROOT / "index.js").read_text(encoding="utf-8"), encoding="utf-8")

    result = run_module("plugin", "validate", str(plugin))

    assert result.returncode == 1
    payload = json.loads(result.stdout)
    assert any(error["code"] == "PLUGIN_HOST_ACTION_DENIED" for error in payload["data"]["errors"])
    denied = next(error for error in payload["data"]["errors"] if error["code"] == "PLUGIN_HOST_ACTION_DENIED")
    assert denied["details"]["action"] == "server.setup"


def test_plugin_timeout_uses_common_uncertain_error():
    from cli_anything.indesign.core.errors import CliError
    from cli_anything.indesign.core.plugins.backend import PluginBackend
    from cli_anything.indesign.core.plugins.manifest import PluginRecord

    record = PluginRecord(
        id="fake-html-plugin",
        source="test",
        root=FAKE_PLUGIN_ROOT,
        manifest_path=FAKE_PLUGIN_ROOT / "manifest.json",
        manifest=json.loads((FAKE_PLUGIN_ROOT / "manifest.json").read_text(encoding="utf-8")),
    )
    backend = PluginBackend(record, timeout=0.001)

    try:
        backend.request("plugin/handshake", {"sleep_ms": 1000})
    except CliError as exc:
        assert exc.code == "TIMEOUT"
        assert exc.state_uncertain is True
    else:
        raise AssertionError("plugin timeout should fail")


def test_router_passes_timeout_to_plugin_backend_and_uses_manifest_default():
    from cli_anything.indesign.core.catalog import Catalog, plugin_tool_entries
    from cli_anything.indesign.core.plugins.manifest import PluginRecord
    from cli_anything.indesign.core.router import Router

    manifest = json.loads((FAKE_PLUGIN_ROOT / "manifest.json").read_text(encoding="utf-8"))
    manifest["timeout_default_ms"] = 2500
    record = PluginRecord(
        id="fake-html-plugin",
        source="test",
        root=FAKE_PLUGIN_ROOT,
        manifest_path=FAKE_PLUGIN_ROOT / "manifest.json",
        manifest=manifest,
    )
    tools = plugin_tool_entries(
        record,
        [
            {
                "id": "html.authoring_lint",
                "domain": "html",
                "name": "authoring_lint",
                "arg_names": ["package"],
                "preconditions": [],
                "return_example": {},
                "failure_example": {},
            }
        ],
    )
    catalog = Catalog(repo_root=REPO_ROOT).with_exposed_tools(
        plugin_tools=tools,
        plugin_domain_summaries={"html": "HTML plugin"},
        plugin_records={record.id: record},
    )
    tool = next(item for item in catalog.list_tools(source="plugin") if item["id"] == "html.authoring_lint")

    assert Router(catalog=catalog, repo_root=REPO_ROOT)._plugin_backend(tool).timeout == 3
    assert Router(catalog=catalog, repo_root=REPO_ROOT, backend_timeout_seconds=9)._plugin_backend(tool).timeout == 9


def test_plugin_install_list_remove_project_plugin(tmp_path):
    install = run_module("plugin", "install", str(FAKE_PLUGIN_ROOT), cwd=tmp_path)
    assert install.returncode == 0
    install_payload = json.loads(install.stdout)
    assert install_payload["data"]["id"] == "fake-html-plugin"

    record = tmp_path / ".indesign-cli" / "plugins" / "fake-html-plugin.json"
    assert record.exists()

    listed = run_module("plugin", "list", cwd=tmp_path)
    listed_payload = json.loads(listed.stdout)
    assert listed.returncode == 0
    assert listed_payload["data"]["plugins"][0]["id"] == "fake-html-plugin"
    assert listed_payload["data"]["plugins"][0]["domain"] == "html"

    removed = run_module("plugin", "remove", "fake-html-plugin", cwd=tmp_path)
    assert removed.returncode == 0
    assert not record.exists()


def test_plugin_tools_enter_catalog_and_router(tmp_path):
    run_module("plugin", "install", str(FAKE_PLUGIN_ROOT), cwd=tmp_path)

    domains = json.loads(run_module("tool", "domains", cwd=tmp_path).stdout)["data"]
    html_domain = next(item for item in domains if item["domain"] == "html")
    assert html_domain["count_by_source"]["plugin"] == 3

    listed = json.loads(run_module("tool", "list", "--domain", "html", cwd=tmp_path).stdout)["data"]
    assert {item["id"] for item in listed} == {
        "html.authoring_lint",
        "html.compile_instructions",
        "html.build_indesign",
    }
    assert all(item["source"] == "plugin" for item in listed)

    schema = json.loads(run_module("tool", "schema", "html.authoring_lint", cwd=tmp_path).stdout)["data"]
    assert schema["tool"]["plugin"] == "fake-html-plugin"
    assert schema["inputSchema"]["required"] == ["package"]


def test_plugin_tool_call_updates_session(tmp_path):
    run_module("plugin", "install", str(FAKE_PLUGIN_ROOT), cwd=tmp_path)
    args_file = tmp_path / "args.json"
    args_file.write_text(json.dumps({"package": "deck.config.json", "strict": True}), encoding="utf-8")

    result = run_module("tool", "call", "html.authoring_lint", "--args", str(args_file), cwd=tmp_path)
    assert result.returncode == 0
    payload = json.loads(result.stdout)
    assert payload["source"] == "plugin"
    assert payload["data"]["status"] == "complete"

    session = json.loads(run_module("session", "show", cwd=tmp_path).stdout)["data"]
    recent = session["recent_calls"][0]
    assert recent["tool_id"] == "html.authoring_lint"
    assert recent["source"] == "plugin"
    assert recent["plugin"] == "fake-html-plugin"
    assert recent["artifacts"][0]["path"] == "test/workspace/lint-report.json"


def test_plugin_host_action_resume_and_denial(tmp_path):
    run_module("plugin", "install", str(FAKE_PLUGIN_ROOT), cwd=tmp_path)
    args_file = tmp_path / "args.json"
    args_file.write_text(json.dumps({"package": "deck.config.json"}), encoding="utf-8")

    ok_result = run_module("tool", "call", "html.build_indesign", "--args", str(args_file), cwd=tmp_path)
    assert ok_result.returncode == 0
    ok_payload = json.loads(ok_result.stdout)
    assert ok_payload["data"]["data"]["resumed"] is True
    assert ok_payload["data"]["data"]["host_results"][0]["tool_id"] == "session.show"

    bad_args = tmp_path / "bad-args.json"
    bad_args.write_text(json.dumps({"package": "deck.config.json", "mode": "illegal-host-action"}), encoding="utf-8")
    bad_result = run_module("tool", "call", "html.build_indesign", "--args", str(bad_args), cwd=tmp_path)
    assert bad_result.returncode == 1
    bad_payload = json.loads(bad_result.stdout)
    assert bad_payload["error"]["code"] == "PLUGIN_HOST_ACTION_FAILED"
    assert bad_payload["error"]["details"]["host_results"][0]["error"]["code"] == "PLUGIN_HOST_ACTION_DENIED"


def test_plugin_doctor_reports_installed_plugin(tmp_path):
    run_module("plugin", "install", str(FAKE_PLUGIN_ROOT), cwd=tmp_path)
    result = run_module("plugin", "doctor", "fake-html-plugin", cwd=tmp_path)
    assert result.returncode == 0
    payload = json.loads(result.stdout)
    assert payload["data"]["ok"] is True
    assert payload["data"]["plugin"] == "fake-html-plugin"
    assert any(check["name"] == "validate" for check in payload["data"]["checks"])


def test_run_stdin_script_reads_utf8_bytes(tmp_path, monkeypatch):
    from cli_anything.indesign.core.scripts import run_stdin_script

    class FakeStdin:
        buffer = io.BytesIO('"STDIN_UTF8_OK|中文";'.encode("utf-8"))

    class FakeRouter:
        def __init__(self):
            self.file_path = None

        def call(self, tool_id, args):
            self.file_path = Path(args["filePath"])
            return {
                "tool_id": tool_id,
                "script": self.file_path.read_text(encoding="utf-8"),
            }

    router = FakeRouter()
    monkeypatch.setattr(sys, "stdin", FakeStdin())

    payload = run_stdin_script(router, tmp_path)

    assert payload["tool_id"] == "template.run_jsx_file"
    assert "STDIN_UTF8_OK|中文" in payload["script"]
    assert router.file_path == tmp_path / ".indesign-cli" / "tmp" / "stdin.jsx"


def test_domain_top_tools_include_exposed_hidden_handlers():
    from cli_anything.indesign.core.catalog import Catalog

    catalog = Catalog(repo_root=REPO_ROOT)
    book = next(item for item in catalog.domains() if item["domain"] == "book")
    assert "book.create_book" in book["top_tools"]
    assert book["count_by_source"]["hidden_handler"] == 15


def test_hidden_handlers_are_listed_callable_and_schema_backed():
    from cli_anything.indesign.core.catalog import Catalog

    expected = {
        "book.create_book",
        "book.open_book",
        "book.add_document_to_book",
        "book.synchronize_book",
        "book.export_book",
        "book.package_book",
        "book.get_book_info",
        "book.list_books",
        "book.repaginate_book",
        "book.update_all_cross_references",
        "book.update_all_numbers",
        "book.update_chapter_and_paragraph_numbers",
        "book.preflight_book",
        "book.print_book",
        "book.set_book_properties",
        "presentation.create_presentation_document",
        "presentation.add_cover_page",
        "presentation.add_section_page",
        "presentation.add_full_bleed_image",
        "presentation.add_image_grid",
        "presentation.export_presentation_pdf",
        "document.cleanup_document",
        "document.data_merge",
        "document.export_document_xml",
        "document.get_document_xml_structure",
        "document.open_cloud_document",
        "document.preflight_document",
        "document.save_document_to_cloud",
        "document.validate_document",
        "spread.place_xml_on_spread",
    }
    catalog = Catalog(repo_root=REPO_ROOT)
    hidden_tools = catalog.list_tools(source="hidden_handler", callable_only=True)
    assert {item["id"] for item in hidden_tools} == expected
    assert len(hidden_tools) == 30
    assert all(item["availability"] == "exposed" for item in hidden_tools)
    assert all(item["schema_size"] != "unknown" for item in hidden_tools)
    assert "filePath" in next(item for item in hidden_tools if item["id"] == "book.create_book")["arg_names"]
    assert "files" in next(item for item in hidden_tools if item["id"] == "presentation.add_image_grid")["arg_names"]

    book_info = next(item for item in hidden_tools if item["id"] == "book.get_book_info")
    assert "调用已有" not in book_info["one_line_purpose"]
    assert book_info["side_effects"] == []
    assert book_info["target_scope"] == "indesign_book"

    export_book = next(item for item in hidden_tools if item["id"] == "book.export_book")
    assert "Book" in export_book["one_line_purpose"]
    assert export_book["side_effects"] == ["filesystem_write"]
    assert {"pdf", "epub", "html"}.issubset(set(export_book["artifact_kinds"]))
    assert export_book["produces_artifacts"] is True

    export_presentation = next(item for item in hidden_tools if item["id"] == "presentation.export_presentation_pdf")
    assert export_presentation["side_effects"] == ["filesystem_write"]
    assert export_presentation["artifact_kinds"] == ["pdf"]
    assert export_presentation["target_scope"] == "filesystem"

    cleanup = next(item for item in hidden_tools if item["id"] == "document.cleanup_document")
    assert cleanup["arg_names"] == ["removeUnusedStyles", "removeUnusedColors", "removeUnusedLayers", "removeHiddenElements"]
    assert cleanup["source"] == "hidden_handler"


def test_tool_schema_supports_hidden_handler():
    from cli_anything.indesign.core.catalog import Catalog
    from cli_anything.indesign.core.router import Router

    router = Router(catalog=Catalog(repo_root=REPO_ROOT), repo_root=REPO_ROOT)
    payload = router.schema("book.create_book")
    schema = payload["inputSchema"]
    assert schema["required"] == ["filePath"]
    assert schema["properties"]["filePath"]["type"] == "string"
    assert payload["tool"]["source"] == "hidden_handler"


def test_tool_call_hidden_handler_validates_required_args():
    from cli_anything.indesign.core.catalog import Catalog
    from cli_anything.indesign.core.errors import CliError
    from cli_anything.indesign.core.router import Router

    router = Router(catalog=Catalog(repo_root=REPO_ROOT), repo_root=REPO_ROOT)
    try:
        router.call("book.create_book", {})
    except CliError as exc:
        assert exc.code == "MISSING_ARGUMENT"
        assert exc.details["argument"] == "filePath"
    else:
        raise AssertionError("hidden handler should reject missing required argument")


def test_internal_bridge_resolves_tools_from_registry_without_legacy_bridge():
    old_bridge = REPO_ROOT / "agent-harness" / "cli_anything" / "indesign" / "node" / "hidden_handler_bridge.mjs"
    assert not old_bridge.exists()

    bridge = REPO_ROOT / "agent-harness" / "cli_anything" / "indesign" / "node" / "internal_tool_bridge.mjs"
    assert bridge.exists()
    assert "src/handlers" not in bridge.read_text(encoding="utf-8")

    result = subprocess.run(
        ["node", str(bridge)],
        cwd=REPO_ROOT,
        input=json.dumps(
            {
                "toolId": "presentation.export_presentation_pdf",
                "args": {},
                "resolveOnly": True,
            }
        ),
        text=True,
        encoding="utf-8",
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    assert result.returncode == 0
    payload = json.loads(result.stdout)
    assert payload["ok"] is True
    assert payload["toolId"] == "presentation.export_presentation_pdf"
    assert payload["source"] == "hidden_handler"


def test_catalog_preserves_artifact_domains_for_node_backed_tools():
    from cli_anything.indesign.core.catalog import Catalog

    catalog = Catalog(repo_root=REPO_ROOT)
    ids = {tool["id"] for tool in catalog.list_tools(callable_only=True)}
    assert "page.add_page" in ids
    assert "master.create_master_spread" in ids
    assert "export.export_pdf" in ids
    assert "graphics.create_rectangle" in ids


def test_catalog_destructive_helper_is_canonical_for_cleanup_tools():
    from cli_anything.indesign.core.catalog import _destructive

    assert _destructive("cleanup_document") is False
    assert _destructive("close_document") is True
    assert _destructive("delete_layer") is True
    assert _destructive("create_document") is False


def test_canonical_switch_only_entry_uses_catalog_contract_inference():
    from cli_anything.indesign.core.catalog import canonical_switch_only_entry

    cleanup = canonical_switch_only_entry(
        domain="document",
        name="cleanup_document",
        handler="DocumentHandlers.cleanupDocument",
    )
    assert cleanup["id"] == "document.cleanup_document"
    assert cleanup["source"] == "switch_only_no_cli_schema"
    assert cleanup["side_effects"] == ["indesign_mutation"]
    assert cleanup["destructive"] is False
    assert cleanup["mutates_document"] is True
    assert cleanup["writes_filesystem"] is False
    assert cleanup["needs_indesign"] is True
    assert cleanup["requires_active_document"] is True

    exported = canonical_switch_only_entry(
        domain="document",
        name="export_document_xml",
        handler="DocumentHandlers.exportDocumentXml",
    )
    assert exported["side_effects"] == ["filesystem_write"]
    assert exported["writes_filesystem"] is True
    assert exported["mutates_document"] is False


def test_router_calls_export_verify_cli_primitive(tmp_path):
    from cli_anything.indesign.core.catalog import Catalog
    from cli_anything.indesign.core.router import Router

    pdf = tmp_path / "out.pdf"
    pdf.write_bytes(b"%PDF-1.7\n")
    router = Router(catalog=Catalog(repo_root=REPO_ROOT), repo_root=REPO_ROOT)
    payload = router.call("export.verify", {"path": str(pdf)})
    assert payload["kind"] == "pdf"
    assert payload["signature_ok"] is True


def test_cli_primitive_schema_exposes_required_args():
    from cli_anything.indesign.core.catalog import Catalog
    from cli_anything.indesign.core.router import Router

    router = Router(catalog=Catalog(repo_root=REPO_ROOT), repo_root=REPO_ROOT)
    payload = router.schema("export.verify")
    assert payload["inputSchema"]["required"] == ["path"]
    assert "path" in payload["inputSchema"]["properties"]

    script_payload = router.schema("script.run")
    assert "timeout" in script_payload["inputSchema"]["properties"]
    assert "timeout" in script_payload["tool"]["arg_names"]
    assert "timeout_ms" in script_payload["tool"]["arg_names"]
    assert script_payload["inputSchema"]["oneOf"] == [{"required": ["file"]}, {"required": ["stdin"]}]
    assert "文件模式" in script_payload["inputSchema"]["properties"]["file"]["description"]
    assert "临时探针" in script_payload["inputSchema"]["properties"]["stdin"]["description"]
    assert "session_write" in script_payload["tool"]["side_effects"]

    health_payload = router.schema("server.health")
    assert "connect_indesign" in health_payload["tool"]["arg_names"]


def test_tool_schema_includes_agent_metadata():
    from cli_anything.indesign.core.catalog import Catalog
    from cli_anything.indesign.core.router import Router

    router = Router(catalog=Catalog(repo_root=REPO_ROOT), repo_root=REPO_ROOT)
    payload = router.schema("export.verify")

    assert "metadata" in payload
    metadata = payload["metadata"]
    for field in (
        "requires_active_document",
        "mutates_document",
        "writes_filesystem",
        "returns_artifacts",
        "return_shape",
        "return_example",
        "failure_example",
        "preconditions",
        "safe_usage_notes",
        "common_next_steps",
    ):
        assert field in metadata
    assert metadata["returns_artifacts"] is True


def test_tool_explain_returns_task_level_contract():
    result = run_module("tool", "explain", "graphics.create_rectangle")
    assert result.returncode == 0
    payload = json.loads(result.stdout)
    assert payload["ok"] is True
    data = payload["data"]
    assert data["tool_id"] == "graphics.create_rectangle"
    assert "preconditions" in data
    assert "side_effects" in data
    assert "return_example" in data
    assert "failure_example" in data
    assert "common_next_steps" in data


def test_agent_quickstart_returns_canonical_commands():
    result = run_module("agent", "quickstart")
    assert result.returncode == 0
    payload = json.loads(result.stdout)
    commands = payload["data"]["commands"]
    assert "indesign-cli server health --deep --connect-indesign" in commands
    assert any("--args-file" in command for command in commands)


def test_inline_script_tool_is_marked_as_short_probe():
    from cli_anything.indesign.indesign_cli import build_catalog_with_backends

    catalog, _warnings = build_catalog_with_backends()
    inline_tool = next(item for item in catalog.list_tools(domain="script") if item["id"] == "script.execute_indesign_code")
    assert "短" in inline_tool["one_line_purpose"]
    assert "script.run" in inline_tool["one_line_purpose"]


def test_cli_help_is_agent_oriented():
    root = run_module("--help")
    assert root.returncode == 0
    assert "Agent" in root.stdout
    assert "发现工具" in root.stdout

    tool_list = run_module("tool", "list", "--help")
    assert tool_list.returncode == 0
    assert "不带过滤条件时返回工具域摘要" in tool_list.stdout

    plugin_doctor = run_module("plugin", "doctor", "--help")
    assert plugin_doctor.returncode == 0
    assert "写入临时 session 探针" in plugin_doctor.stdout


def test_router_passes_timeout_to_mcp_backend():
    from cli_anything.indesign.core.catalog import Catalog
    from cli_anything.indesign.core.errors import CliError
    from cli_anything.indesign.core.router import Router

    router = Router(catalog=Catalog(repo_root=REPO_ROOT), repo_root=REPO_ROOT, backend_timeout_seconds=123)
    assert router._backend("advanced").timeout_seconds == 123

    try:
        Router._parse_timeout(0)
    except CliError as exc:
        assert exc.code == "BAD_TIMEOUT"
    else:
        raise AssertionError("invalid timeout should fail")


def test_every_listed_callable_tool_has_agent_contract_fields():
    from cli_anything.indesign.indesign_cli import build_catalog_with_backends

    catalog, _warnings = build_catalog_with_backends()
    tools = catalog.list_tools(callable_only=True)
    assert tools

    required_fields = {
        "id",
        "domain",
        "name",
        "one_line_purpose",
        "arg_names",
        "source",
        "rank",
        "schema_size",
        "availability",
        "callable",
        "requires",
        "side_effects",
        "destructive",
        "target_scope",
        "needs_indesign",
        "produces_artifacts",
        "requires_active_document",
        "requires_active_page",
        "uses_selection",
        "opens_document",
        "closes_document",
        "may_close_document",
        "mutates_document",
        "writes_filesystem",
        "returns_artifacts",
        "return_shape",
        "return_example",
        "failure_example",
        "preconditions",
        "safe_usage_notes",
        "common_next_steps",
    }
    for tool in tools:
        assert required_fields.issubset(tool), tool["id"]
        assert isinstance(tool["arg_names"], list), tool["id"]
        assert isinstance(tool["requires"], list), tool["id"]
        assert isinstance(tool["side_effects"], list), tool["id"]
        assert tool["callable"] is True, tool["id"]
        assert "inputSchema" not in tool, tool["id"]


def test_every_callable_tool_schema_covers_catalog_args():
    from cli_anything.indesign.core.mcp_backend import McpBackend
    from cli_anything.indesign.core.router import PRIMITIVE_SCHEMAS, Router
    from cli_anything.indesign.indesign_cli import build_catalog_with_backends

    catalog, _warnings = build_catalog_with_backends()
    router = Router(catalog=catalog, repo_root=REPO_ROOT)
    backend_schemas: dict[tuple[str, str], dict] = {}
    for source, entry in (("advanced", "src/advanced/index.js"), ("classic", "src/index.js")):
        for item in McpBackend(repo_root=REPO_ROOT, entry=entry).list_tools():
            backend_schemas[(source, item["name"])] = item.get("inputSchema", {})

    for tool in catalog.list_tools(callable_only=True):
        if tool["source"] in {"cli", "cli.primitive", "script"}:
            schema = PRIMITIVE_SCHEMAS[tool["id"]]
        elif tool["source"] == "hidden_handler":
            schema = router.schema(tool["id"])["inputSchema"]
        elif tool["source"] == "plugin":
            schema = router.schema(tool["id"])["inputSchema"]
        else:
            schema = backend_schemas[(tool["source"], tool["name"])]
        properties = schema.get("properties", {})
        assert schema.get("type") == "object", tool["id"]
        assert isinstance(properties, dict), tool["id"]
        for arg_name in tool["arg_names"]:
            assert arg_name in properties, tool["id"]
        for required_name in schema.get("required", []):
            assert required_name in properties, tool["id"]


def test_tool_call_missing_args_returns_json_failure(tmp_path):
    args_file = tmp_path / "args.json"
    args_file.write_text("{}", encoding="utf-8")
    result = run_module("tool", "call", "export.verify", "--args", str(args_file))
    assert result.returncode == 1
    payload = json.loads(result.stdout)
    assert payload["ok"] is False
    assert payload["error"]["code"] == "MISSING_ARGUMENT"
    assert "Traceback" not in result.stderr


def test_empty_schema_tool_call_can_omit_args(tmp_path):
    result = run_module("tool", "call", "session.show", cwd=tmp_path)
    assert result.returncode == 0
    payload = json.loads(result.stdout)
    assert payload["ok"] is True
    assert payload["tool_id"] == "session.show"


def test_required_schema_without_args_returns_json_failure():
    result = run_module("tool", "call", "export.verify")
    assert result.returncode == 1
    payload = json.loads(result.stdout)
    assert_failure_envelope(payload, "ARGS_REQUIRED")
    assert "usage:" not in result.stdout.lower()


def test_args_file_accepts_unicode_path(tmp_path):
    args_file = tmp_path / "参数.json"
    args_file.write_text(json.dumps({}), encoding="utf-8")

    result = run_module("tool", "call", "session.show", "--args-file", str(args_file), cwd=tmp_path)

    assert result.returncode == 0
    payload = json.loads(result.stdout)
    assert payload["ok"] is True


def test_missing_args_file_uses_stable_failure_envelope(tmp_path):
    result = run_module("tool", "call", "session.show", "--args-file", str(tmp_path / "missing.json"))
    assert result.returncode == 1
    assert_failure_envelope(json.loads(result.stdout), "ARGS_FILE_NOT_FOUND")


def test_bad_args_json_uses_stable_failure_envelope(tmp_path):
    args_file = tmp_path / "bad.json"
    args_file.write_text("{bad", encoding="utf-8")
    result = run_module("tool", "call", "session.show", "--args-file", str(args_file))
    assert result.returncode == 1
    assert_failure_envelope(json.loads(result.stdout), "ARGS_JSON_INVALID")


def test_tool_call_accepts_utf8_bom_args_file(tmp_path):
    args_file = tmp_path / "args-bom.json"
    pdf = tmp_path / "out.pdf"
    pdf.write_bytes(b"%PDF-1.7\n")
    args_file.write_text(json.dumps({"path": str(pdf)}), encoding="utf-8-sig")

    result = run_module("tool", "call", "export.verify", "--args", str(args_file))
    assert result.returncode == 0
    payload = json.loads(result.stdout)
    assert payload["ok"] is True
    assert payload["data"]["kind"] == "pdf"


def test_tool_call_updates_session(tmp_path):
    run_module("session", "clear")
    args_file = tmp_path / "args.json"
    pdf = tmp_path / "out.pdf"
    pdf.write_bytes(b"%PDF-1.7\n")
    args_file.write_text(json.dumps({"path": str(pdf)}), encoding="utf-8")

    result = run_module("tool", "call", "export.verify", "--args", str(args_file))
    assert result.returncode == 0

    session = run_module("session", "show")
    payload = json.loads(session.stdout)
    assert payload["data"]["recent_calls"][0]["tool_id"] == "export.verify"
    assert payload["data"]["recent_calls"][0]["ok"] is True


def test_script_run_failure_updates_session():
    run_module("session", "clear")

    result = run_module("script", "run")
    assert result.returncode == 1

    session = run_module("session", "show")
    payload = json.loads(session.stdout)
    assert payload["data"]["recent_calls"][0]["tool_id"] == "script.run"
    assert payload["data"]["recent_calls"][0]["ok"] is False


def test_timeout_exception_returns_uncertain_failure_envelope():
    from cli_anything.indesign.core.envelope import failure
    from cli_anything.indesign.core.errors import TimeoutError

    payload = failure(command="tool call", error=TimeoutError("MCP process timed out"), duration_ms=2)

    assert_failure_envelope(payload, "TIMEOUT")
    assert payload["state_uncertain"] is True
    assert isinstance(payload["next_action"], str)


def test_session_doctor_reports_recent_failure(tmp_path):
    from cli_anything.indesign.core.session import SessionStore

    store = SessionStore(tmp_path)
    store.record_call(
        tool_id="export.verify",
        domain="export",
        source="cli",
        ok=False,
        duration_ms=12,
        error_code="ARTIFACT_NOT_FOUND",
        error_summary="Missing output",
        next_action="Create the artifact first.",
    )

    result = run_module("session", "doctor", cwd=tmp_path)

    assert result.returncode == 0
    payload = json.loads(result.stdout)
    assert payload["ok"] is True
    assert "recent_failure" in payload["data"]
    assert payload["data"]["recent_failure"]["error_code"] == "ARTIFACT_NOT_FOUND"
    assert "next_action" in payload["data"]


def test_tool_batch_stops_on_first_failure(tmp_path):
    plan = tmp_path / "batch.json"
    plan.write_text(
        json.dumps(
            {
                "steps": [
                    {"id": "show", "type": "tool", "tool": "session.show", "args": {}},
                    {"id": "bad-step", "type": "tool", "tool": "missing.tool", "args": {}},
                ]
            }
        ),
        encoding="utf-8",
    )

    result = run_module("tool", "batch", "--plan", str(plan), cwd=tmp_path)

    assert result.returncode == 1
    payload = json.loads(result.stdout)
    assert payload["ok"] is False
    assert payload["data"]["failed_step"] == "bad-step"
    assert payload["data"]["steps"][0]["ok"] is True


def test_backend_tool_failure_returns_failure_envelope_without_path_leak(tmp_path):
    args_file = tmp_path / "args.json"
    secret_path = r"D:\Clients\AcmeSecret\missing.jsx"
    args_file.write_text(json.dumps({"filePath": secret_path}), encoding="utf-8")
    result = run_module("tool", "call", "template.run_jsx_file", "--args", str(args_file))
    assert result.returncode == 1
    payload = json.loads(result.stdout)
    dumped = json.dumps(payload, ensure_ascii=False)
    assert payload["ok"] is False
    assert payload["error"]["code"] == "MCP_TOOL_FAILED"
    assert "AcmeSecret" not in dumped
    assert "missing.jsx" not in dumped
    assert "D:\\Clients" not in dumped


def test_backend_tool_response_exposes_nested_json_result():
    from cli_anything.indesign.core.mcp_backend import McpBackend

    backend = McpBackend(repo_root=REPO_ROOT, entry="src/index.js")
    response = {
        "content": [
            {
                "type": "text",
                "text": json.dumps(
                    {
                        "success": True,
                        "operation": "Run JSX File",
                        "result": json.dumps({"ok": True, "marker": "NESTED_JSON_OK"}),
                    }
                ),
            }
        ]
    }

    payload = backend._parse_tool_response("run_jsx_file", response)

    assert payload["parsed"]["result"]
    assert payload["result_json"] == {"ok": True, "marker": "NESTED_JSON_OK"}


def test_backend_tool_response_fails_on_nested_json_failure():
    from cli_anything.indesign.core.errors import CliError
    from cli_anything.indesign.core.mcp_backend import McpBackend

    backend = McpBackend(repo_root=REPO_ROOT, entry="src/index.js")
    response = {
        "content": [
            {
                "type": "text",
                "text": json.dumps(
                    {
                        "success": True,
                        "operation": "Run JSX File",
                        "result": json.dumps({"ok": False, "step": "export", "error": "boom"}),
                    }
                ),
            }
        ]
    }

    try:
        backend._parse_tool_response("run_jsx_file", response)
    except CliError as exc:
        assert exc.code == "INDESIGN_SCRIPT_FAILED"
        assert exc.details["step"] == "export"
    else:
        raise AssertionError("nested ok:false should fail")


def test_backend_tool_response_fails_on_top_level_ok_false():
    from cli_anything.indesign.core.errors import CliError
    from cli_anything.indesign.core.mcp_backend import McpBackend

    backend = McpBackend(repo_root=REPO_ROOT, entry="src/index.js")
    response = {
        "content": [
            {
                "type": "text",
                "text": json.dumps(
                    {
                        "ok": False,
                        "code": "INDESIGN_SCRIPT_FAILED",
                        "message": "INTENTIONAL_REFERENCE_ERROR is undefined",
                        "step": "trigger intentional reference failure",
                        "line": 27,
                        "fileName": "probe.jsx",
                        "errorName": "ReferenceError",
                        "errorNumber": 2,
                        "data": {"expectedMarker": "INTENTIONAL_ERROR_MARKER"},
                    }
                ),
            }
        ]
    }

    try:
        backend._parse_tool_response("get_document_info", response)
    except CliError as exc:
        assert exc.code == "INDESIGN_SCRIPT_FAILED"
        assert exc.details["step"] == "trigger intentional reference failure"
        assert exc.details["line"] == 27
        assert exc.details["fileName"] == "probe.jsx"
        assert exc.details["errorName"] == "ReferenceError"
        assert exc.details["errorNumber"] == 2
        assert exc.details["data"]["expectedMarker"] == "INTENTIONAL_ERROR_MARKER"
    else:
        raise AssertionError("top-level ok:false should fail")


def test_backend_tool_response_fails_on_legacy_failure_string():
    from cli_anything.indesign.core.errors import CliError
    from cli_anything.indesign.core.mcp_backend import McpBackend

    backend = McpBackend(repo_root=REPO_ROOT, entry="src/index.js")
    response = {"content": [{"type": "text", "text": "No document open"}]}

    try:
        backend._parse_tool_response("get_document_info", response)
    except CliError as exc:
        assert exc.code == "NO_ACTIVE_DOCUMENT"
    else:
        raise AssertionError("legacy failure string should fail")


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


def test_export_verify_accepts_powershell_roundtrip_timestamp(tmp_path):
    pdf = tmp_path / "out.pdf"
    pdf.write_bytes(b"%PDF-1.7\n")
    result = run_module(
        "export",
        "verify",
        str(pdf),
        "--created-after",
        "2999-01-01T00:00:00.0000000+00:00",
    )
    assert result.returncode == 1
    payload = json.loads(result.stdout)
    assert payload["error"]["code"] == "ARTIFACT_TOO_OLD"


def test_session_compact_does_not_store_args(tmp_path):
    from cli_anything.indesign.core.session import SessionStore

    store = SessionStore(tmp_path)
    store.record_call(tool_id="document.info", domain="document", source="classic", ok=True, duration_ms=5)
    payload = store.read(compact=True)
    assert "recent_calls" in payload
    assert "args" not in json.dumps(payload, ensure_ascii=False)


def test_health_reports_project_files():
    from cli_anything.indesign.core.health import health

    payload = health(REPO_ROOT, deep=False)
    assert payload["node_entry_advanced"]["exists"] is True
    assert payload["node_entry_classic"]["exists"] is True
    assert payload["deep"] is False


def test_health_reports_toolchain_diagnostics(monkeypatch):
    from cli_anything.indesign.core import health as health_module

    monkeypatch.setattr(
        health_module,
        "toolchain_report",
        lambda: {
            "node": {"path": "C:\\nodejs\\node.exe", "version": "v22.15.0"},
            "npm": {"path": "C:\\nodejs\\npm.cmd", "version": None},
        },
    )

    payload = health_module.health(REPO_ROOT, deep=False)

    assert payload["node"]["available"] is True
    assert payload["node"]["version"] == "v22.15.0"
    assert payload["npm"]["available"] is False
    assert payload["python"]["executable"]
    assert payload["python"]["package_root"]
    assert "user_base" in payload["python"]
    assert payload["server_root"]["path"] == str(REPO_ROOT)
    assert payload["server_root"]["source"] in {"auto", "env_override"}
    assert isinstance(payload["server_root"]["long_path_risk"], bool)
    assert "unc" in payload["cwd"]


def test_invalid_server_root_override_emits_json_envelope(tmp_path):
    env_overrides = {"INDESIGN_CLI_SERVER_ROOT": str(tmp_path)}

    version_result = run_module("--version", env_overrides=env_overrides)
    assert version_result.returncode == 0
    assert json.loads(version_result.stdout)["ok"] is True

    health_result = run_module("server", "health", env_overrides=env_overrides)
    assert health_result.returncode == 1
    payload = json.loads(health_result.stdout)
    assert payload["ok"] is False
    assert payload["error"]["code"] == "SERVER_ROOT_INVALID"
    assert payload["error"]["hint"]
    assert "Traceback" not in health_result.stderr


def test_deep_health_does_not_claim_unchecked_com_probe():
    from cli_anything.indesign.core.health import health

    payload = health(REPO_ROOT, deep=True)
    assert payload["winax"]["checked"] is True
    assert payload["indesign_com"]["checked"] is False
    assert "reason" in payload["indesign_com"]


def test_health_connect_indesign_uses_explicit_com_probe(monkeypatch):
    from cli_anything.indesign.core import health as health_module

    def fake_probe(repo_root):
        assert repo_root == REPO_ROOT
        return {"checked": True, "available": True, "appName": "Adobe InDesign", "version": "20.x", "documentsCount": 0}

    monkeypatch.setattr(health_module, "indesign_com_probe", fake_probe)

    payload = health_module.health(REPO_ROOT, deep=True, connect_indesign=True)

    assert payload["indesign_com"]["checked"] is True
    assert payload["indesign_com"]["available"] is True
    assert payload["indesign_com"]["documentsCount"] == 0


def test_health_winax_probe_uses_resolved_node(monkeypatch):
    from cli_anything.indesign.core import health as health_module

    calls = []

    def fake_run(args, **kwargs):
        calls.append(args)

        class Result:
            returncode = 0
            stdout = "ok"
            stderr = ""

        return Result()

    monkeypatch.setattr(health_module, "resolve_node_executable", lambda repo_root: r"D:\runtime\node\node.exe")
    monkeypatch.setattr(subprocess, "run", fake_run)

    payload = health_module._check_winax(REPO_ROOT)

    assert payload["available"] is True
    assert calls[0][0] == r"D:\runtime\node\node.exe"


def test_server_health_parser_accepts_connect_indesign_flag():
    from cli_anything.indesign.indesign_cli import build_parser

    parser = build_parser()
    args = parser.parse_args(["server", "health", "--deep", "--connect-indesign"])

    assert args.deep is True
    assert args.connect_indesign is True


def test_load_args_accepts_inline_json():
    from cli_anything.indesign.core.router import load_args

    assert load_args('{"path": "out.pdf"}') == {"path": "out.pdf"}


def test_load_args_inline_json_invalid_has_hint():
    from cli_anything.indesign.core.errors import CliError
    from cli_anything.indesign.core.router import load_args

    try:
        load_args('{"path": out.pdf}')
    except CliError as exc:
        assert exc.code == "ARGS_JSON_INVALID"
        assert exc.hint
    else:
        raise AssertionError("expected CliError")


def test_load_args_bad_path_reports_args_file_not_found_with_hint():
    from cli_anything.indesign.core.errors import CliError
    from cli_anything.indesign.core.router import load_args

    for value in ("no-such-file.json", 'D:\\bad"path*?.json'):
        try:
            load_args(value)
        except CliError as exc:
            assert exc.code == "ARGS_FILE_NOT_FOUND"
            assert exc.hint
        else:
            raise AssertionError("expected CliError")


def test_argparse_errors_emit_json_envelope():
    result = run_module("tool", "schema")
    assert result.returncode == 1
    payload = json.loads(result.stdout)
    assert payload["ok"] is False
    assert payload["error"]["code"] == "BAD_CLI_ARGS"
    assert "usage" in payload["error"]["details"]
    assert payload["error"]["hint"]


def test_output_is_compact_utf8_by_default_and_pretty_optional():
    compact = run_module("--version")
    assert compact.returncode == 0
    assert len(compact.stdout.strip().splitlines()) == 1

    pretty = run_module("--pretty", "--version")
    assert pretty.returncode == 0
    assert len(pretty.stdout.strip().splitlines()) > 1

    quickstart = run_module("agent", "quickstart")
    assert "\\u" not in quickstart.stdout or "指" in quickstart.stdout


def test_chinese_output_is_not_ascii_escaped():
    result = run_module("server", "health")
    assert result.returncode == 0
    payload = json.loads(result.stdout)
    assert payload["ok"] is True
    # winax.reason 是中文；不允许再被转义成 \uXXXX
    assert "未运行" in result.stdout
    assert "\\u672a" not in result.stdout


def test_unexpected_error_keeps_exception_summary(monkeypatch):
    from cli_anything.indesign import indesign_cli

    def boom(argv=None):
        raise ValueError("boom detail")

    monkeypatch.setattr(indesign_cli, "run", boom)
    import io as io_module

    buffer = io_module.StringIO()
    monkeypatch.setattr(sys, "stdout", buffer)
    exit_code = indesign_cli.main(["tool", "domains"])
    payload = json.loads(buffer.getvalue())
    assert exit_code == 1
    assert payload["error"]["code"] == "UNEXPECTED_ERROR"
    assert "boom detail" in payload["error"]["message"]
    assert payload["error"]["details"]["type"] == "ValueError"
    assert payload["error"]["details"]["location"]
    assert payload["error"]["hint"]


def test_scrub_text_paths_keeps_workspace_paths_relative(tmp_path):
    from cli_anything.indesign.core.paths import scrub_text_paths

    inside = tmp_path / "test" / "workspace" / "probe.jsx"
    text = f"ENOENT: no such file, open '{inside}' and D:\\Clients\\AcmeSecret\\layout.indd"
    scrubbed = scrub_text_paths(text, allow_roots=[tmp_path])
    assert "test/workspace/probe.jsx" in scrubbed
    assert "AcmeSecret" not in scrubbed
    assert "<external_path" in scrubbed


def test_batch_step_invalid_includes_expected_step_template(tmp_path):
    from cli_anything.indesign.core.errors import CliError
    from cli_anything.indesign.core.batch import run_batch

    plan = tmp_path / "plan.json"
    plan.write_text(json.dumps({"steps": [{"tool": "session.show", "args": {}}]}), encoding="utf-8")
    try:
        run_batch(None, plan)
    except CliError as exc:
        assert exc.code == "BATCH_STEP_INVALID"
        assert exc.details["expected_step"]["type"] == "tool"
        assert exc.hint and "steps" in exc.hint
    else:
        raise AssertionError("expected CliError")


def test_mcp_failure_message_falls_back_to_result_text():
    from cli_anything.indesign.core.errors import CliError
    from cli_anything.indesign.core.mcp_backend import McpBackend

    backend = McpBackend(repo_root=REPO_ROOT, entry="src/index.js")
    response = {
        "isError": True,
        "content": [{"type": "text", "text": json.dumps({"success": False, "result": "无法访问 JSX 文件：ENOENT"})}],
    }
    try:
        backend._parse_tool_response("run_jsx_file", response)
    except CliError as exc:
        assert "无法访问 JSX 文件" in exc.message
    else:
        raise AssertionError("expected CliError")


def test_tool_call_rejects_unknown_argument_keys():
    from cli_anything.indesign.core.errors import CliError
    from cli_anything.indesign.indesign_cli import validate_call_args

    schema = {"type": "object", "properties": {"path": {"type": "string"}}, "required": ["path"]}
    try:
        validate_call_args({"filePath": "x.pdf"}, schema)
    except CliError as exc:
        assert exc.code == "ARGS_UNKNOWN_KEY"
        assert exc.details["unknown"] == ["filePath"]
        assert exc.details["allowed"] == ["path"]
    else:
        raise AssertionError("expected CliError")
    validate_call_args({"path": "x.pdf"}, schema)


def test_timeout_seconds_validates_fallback_seconds():
    from cli_anything.indesign.core.errors import CliError
    from cli_anything.indesign.indesign_cli import timeout_seconds_from_ms

    assert timeout_seconds_from_ms(None, 300) == 300
    assert timeout_seconds_from_ms(None, None) is None
    try:
        timeout_seconds_from_ms(None, -5)
    except CliError as exc:
        assert exc.code == "BAD_TIMEOUT"
    else:
        raise AssertionError("expected CliError")


def test_tool_list_output_is_slim():
    from cli_anything.indesign.indesign_cli import SLIM_TOOL_FIELDS, slim_tools

    tools = [{key: "x" for key in SLIM_TOOL_FIELDS} | {"return_example": {"big": True}, "plugin": "p1"}]
    slimmed = slim_tools(tools)
    assert "return_example" not in slimmed[0]
    assert slimmed[0]["plugin"] == "p1"
    assert set(slimmed[0]) == set(SLIM_TOOL_FIELDS) | {"plugin"}


def test_tool_list_callable_only_alone_lists_tools():
    result = run_module("tool", "list", "--callable-only")
    assert result.returncode == 0
    payload = json.loads(result.stdout)
    assert isinstance(payload["data"], list)
    assert payload["data"], "expected non-empty tool list"
    assert "id" in payload["data"][0]
    assert "domain" in payload["data"][0]
    assert "return_example" not in payload["data"][0]


def test_artifact_verify_returns_iso_mtime(tmp_path):
    from cli_anything.indesign.core.artifacts import verify_artifact

    pdf = tmp_path / "out.pdf"
    pdf.write_bytes(b"%PDF-1.7 minimal")
    payload = verify_artifact(pdf, cwd=tmp_path)
    assert payload["mtime_iso"]
    assert "T" in payload["mtime_iso"]


def test_session_show_rejects_removed_verbose_flag():
    result = run_module("session", "show", "--verbose")
    assert result.returncode == 1
    payload = json.loads(result.stdout)
    assert payload["error"]["code"] == "BAD_CLI_ARGS"


def test_emit_check_failure_includes_error_object():
    from cli_anything.indesign import indesign_cli

    import io as io_module

    buffer = io_module.StringIO()
    original = sys.stdout
    sys.stdout = buffer
    try:
        exit_code = indesign_cli.emit_check("plugin validate", {"ok": False, "errors": [{"code": "X"}]}, tool_id="plugin.validate")
    finally:
        sys.stdout = original
    payload = json.loads(buffer.getvalue())
    assert exit_code == 1
    assert payload["ok"] is False
    assert payload["tool_success"] is False
    assert payload["error"]["code"] == "CHECK_FAILED"


def run_agent_module(
    *args: str,
    cwd: Path = REPO_ROOT,
    env_overrides: dict[str, str] | None = None,
) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    env["PYTHONPATH"] = str(HARNESS_ROOT)
    env["PYTHONIOENCODING"] = "utf-8"
    if env_overrides:
        env.update(env_overrides)
    return subprocess.run(
        [sys.executable, "-m", "cli_anything.indesign.agent_bootstrapper", *args],
        cwd=cwd,
        env=env,
        text=True,
        encoding="utf-8",
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )


def test_runtime_resolves_explicit_and_bundled_node(monkeypatch, tmp_path):
    from cli_anything.indesign.core.runtime import resolve_node_executable

    explicit = tmp_path / "explicit" / "node.exe"
    explicit.parent.mkdir()
    explicit.write_text("", encoding="utf-8")
    monkeypatch.setenv("INDESIGN_CLI_NODE", str(explicit))

    assert resolve_node_executable(tmp_path) == explicit.resolve()

    monkeypatch.delenv("INDESIGN_CLI_NODE")
    runtime_node = tmp_path / "runtime" / "node" / "node.exe"
    runtime_node.parent.mkdir(parents=True)
    runtime_node.write_text("", encoding="utf-8")
    monkeypatch.setenv("INDESIGN_CLI_RUNTIME_ROOT", str(tmp_path / "runtime"))

    assert resolve_node_executable(tmp_path) == runtime_node.resolve()


def test_mcp_backend_uses_resolved_node(monkeypatch, tmp_path):
    from cli_anything.indesign.core.mcp_backend import McpBackend

    entry = tmp_path / "src" / "index.js"
    entry.parent.mkdir(parents=True)
    entry.write_text("// server", encoding="utf-8")
    node = tmp_path / "runtime" / "node" / "node.exe"
    node.parent.mkdir(parents=True)
    node.write_text("", encoding="utf-8")
    monkeypatch.setenv("INDESIGN_CLI_RUNTIME_ROOT", str(tmp_path / "runtime"))
    calls = []

    class FakeProc:
        def __init__(self):
            self.stdin = io.StringIO()
            self.stdout = io.StringIO(
                json.dumps({"jsonrpc": "2.0", "id": 1, "result": {}})
                + "\n"
                + json.dumps({"jsonrpc": "2.0", "id": 2, "result": {"tools": []}})
                + "\n"
            )
            self.stderr = io.StringIO("")

        def poll(self):
            return None

        def terminate(self):
            return None

        def wait(self, timeout=None):
            return 0

        def kill(self):
            return None

    def fake_popen(cmd, **kwargs):
        calls.append(cmd)
        return FakeProc()

    monkeypatch.setattr(subprocess, "Popen", fake_popen)

    tools = McpBackend(repo_root=tmp_path, entry="src/index.js").list_tools()

    assert tools == []
    assert calls[0][0] == str(node.resolve())


def test_agent_bootstrapper_refuses_to_run_when_required_update_fails(tmp_path):
    install_root = tmp_path / "install"
    current_dir = install_root / "current"
    current_dir.mkdir(parents=True)
    (current_dir / "manifest.json").write_text(json.dumps({"version": "0.4.1"}), encoding="utf-8")

    release = tmp_path / "release" / "indesign-cli-agent.exe"
    release.parent.mkdir(parents=True)
    release.write_text("new release", encoding="utf-8")
    latest = tmp_path / "latest.json"
    latest.write_text(
        json.dumps(
            {
                "schema_version": 1,
                "version": "0.4.2",
                "force": True,
                "url": str(release),
                "sha256": "0" * 64,
            }
        ),
        encoding="utf-8",
    )

    result = run_agent_module(
        "run",
        "--install-root",
        str(install_root),
        "--source",
        str(latest),
        "--",
        "--version",
    )

    assert result.returncode == 1
    payload = json.loads(result.stdout)
    assert payload["ok"] is False
    assert payload["error"]["code"] == "UPDATE_REQUIRED_BUT_FAILED"
    assert payload["current"] == "0.4.1"
    assert payload["latest"] == "0.4.2"


def test_agent_bootstrapper_builds_runtime_env(tmp_path):
    from cli_anything.indesign.core.bootstrapper import build_runtime_env

    runtime_root = tmp_path / "runtime" / "0.4.2"
    node = runtime_root / "node" / "node.exe"
    server = runtime_root / "server"
    node.parent.mkdir(parents=True)
    node.write_text("", encoding="utf-8")
    (server / "src" / "advanced").mkdir(parents=True)
    (server / "package.json").write_text("{}", encoding="utf-8")
    (server / "src" / "index.js").write_text("// classic", encoding="utf-8")
    (server / "src" / "advanced" / "index.js").write_text("// advanced", encoding="utf-8")

    env = build_runtime_env(runtime_root, base_env={"PATH": "x"})

    assert env["INDESIGN_CLI_NODE"] == str(node)
    assert env["INDESIGN_CLI_SERVER_ROOT"] == str(server)
    assert env["PATH"] == "x"


def test_agent_bootstrapper_installs_embedded_runtime_without_node_or_npm(tmp_path):
    embedded = tmp_path / "embedded-runtime"
    node = embedded / "node" / "node.exe"
    server = embedded / "server"
    node.parent.mkdir(parents=True)
    node.write_text("", encoding="utf-8")
    (server / "src" / "advanced").mkdir(parents=True)
    (server / "node_modules" / "winax").mkdir(parents=True)
    (server / "package.json").write_text("{}", encoding="utf-8")
    (server / "src" / "index.js").write_text("// classic", encoding="utf-8")
    (server / "src" / "advanced" / "index.js").write_text("// advanced", encoding="utf-8")

    release = tmp_path / "release" / "indesign-cli-agent.exe"
    release.parent.mkdir(parents=True)
    release.write_text("bootstrapper", encoding="utf-8")
    digest = __import__("hashlib").sha256(release.read_bytes()).hexdigest()
    latest = tmp_path / "latest.json"
    latest.write_text(
        json.dumps(
            {
                "schema_version": 1,
                "version": "0.4.2",
                "force": True,
                "url": str(release),
                "sha256": digest,
            }
        ),
        encoding="utf-8",
    )

    install_root = tmp_path / "install"
    result = run_agent_module(
        "update",
        "--install-root",
        str(install_root),
        "--source",
        str(latest),
        env_overrides={"INDESIGN_CLI_EMBEDDED_RUNTIME_ROOT": str(embedded)},
    )

    assert result.returncode == 0
    payload = json.loads(result.stdout)
    assert payload["ok"] is True
    current = json.loads((install_root / "current" / "manifest.json").read_text(encoding="utf-8"))
    runtime_root = Path(current["runtime_root"])
    assert current["version"] == "0.4.2"
    assert (runtime_root / "node" / "node.exe").exists()
    assert (runtime_root / "server" / "node_modules" / "winax").exists()


def test_agent_bootstrapper_console_alias_and_build_script_are_declared():
    pyproject = (REPO_ROOT / "pyproject.toml").read_text(encoding="utf-8")
    assert 'indesign-cli-agent = "cli_anything.indesign.agent_bootstrapper:main"' in pyproject

    script = REPO_ROOT / "scripts" / "build_agent_bootstrapper.py"
    assert script.exists()
    text = script.read_text(encoding="utf-8")
    assert "PyInstaller" in text
    assert "--onefile" in text
    assert "runtime" in text
    assert "indesign-cli-agent" in text


def test_agent_bootstrapper_child_command_self_dispatches_when_frozen(monkeypatch):
    from cli_anything.indesign import agent_bootstrapper

    monkeypatch.setattr(agent_bootstrapper.sys, "frozen", True, raising=False)
    monkeypatch.setattr(agent_bootstrapper.sys, "executable", r"D:\tools\indesign-cli-agent.exe")

    assert agent_bootstrapper.child_command(["--version"]) == [
        r"D:\tools\indesign-cli-agent.exe",
        "__cli__",
        "--version",
    ]
