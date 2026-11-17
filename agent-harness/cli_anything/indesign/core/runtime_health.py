"""
Runtime health checks for InDesign CLI environment.
"""

import os
import shutil
from pathlib import Path


def check_edge_availability() -> tuple[bool, str]:
    """Check if Microsoft Edge or its WebView2 runtime is available."""
    # 1. Check PATH
    if shutil.which("msedge") or shutil.which("microsoft-edge"):
        return True, "Edge found in PATH"

    # 2. Check standard environment variables
    edge_paths = []
    local_app_data = os.environ.get("LOCALAPPDATA")
    if local_app_data:
        edge_paths.append(Path(local_app_data) / "Microsoft" / "Edge" / "Application" / "msedge.exe")

    program_files = os.environ.get("PROGRAMFILES")
    if program_files:
        edge_paths.append(Path(program_files) / "Microsoft" / "Edge" / "Application" / "msedge.exe")

    program_files_x86 = os.environ.get("PROGRAMFILES(X86)")
    if program_files_x86:
        edge_paths.append(Path(program_files_x86) / "Microsoft" / "Edge" / "Application" / "msedge.exe")

    # 3. Fallback hardcoded paths if env vars are missing or incomplete
    fallback_paths = [
        Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"),
        Path(r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"),
        Path(r"C:\Users\Default\AppData\Local\Microsoft\Edge\Application\msedge.exe"),
    ]
    for fp in fallback_paths:
        if fp not in edge_paths:
            edge_paths.append(fp)

    for path in edge_paths:
        if path.exists():
            return True, f"Edge found at {path}"

    return False, "EDGE_NOT_AVAILABLE: Microsoft Edge executable not found"


def run_health_checks() -> dict:
    """Run all runtime health checks."""
    edge_ok, edge_msg = check_edge_availability()
    return {
        "edge": {
            "status": "ok" if edge_ok else "error",
            "message": edge_msg
        }
    }
