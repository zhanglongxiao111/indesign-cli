from support import *


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


def test_agent_release_manifest_uses_artifact_schema():
    script = REPO_ROOT / "scripts" / "build_agent_bootstrapper.py"
    text = script.read_text(encoding="utf-8")

    assert '"artifact"' in text
    assert '"github_url"' in text
    assert '"runtime_dir"' not in text


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
