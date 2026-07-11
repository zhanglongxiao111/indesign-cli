from setuptools import find_namespace_packages, setup


setup(
    name="indesign-cli",
    version="0.5.0",
    description="Agent-native CLI harness for Adobe InDesign automation",
    packages=find_namespace_packages(include=["cli_anything.*"]),
    python_requires=">=3.10",
    entry_points={
        "console_scripts": [
            "indesign-cli=cli_anything.indesign.indesign_cli:main",
            "cli-anything-indesign=cli_anything.indesign.indesign_cli:main",
        ],
    },
    package_data={"cli_anything.indesign": ["node/*.mjs"]},
)
