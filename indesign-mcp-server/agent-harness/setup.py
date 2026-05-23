from setuptools import find_namespace_packages, setup


setup(
    name="cli-anything-indesign",
    version="0.1.0",
    description="Agent-native CLI harness for Adobe InDesign automation",
    packages=find_namespace_packages(include=["cli_anything.*"]),
    python_requires=">=3.10",
    entry_points={
        "console_scripts": [
            "cli-anything-indesign=cli_anything.indesign.indesign_cli:main",
        ],
    },
)
