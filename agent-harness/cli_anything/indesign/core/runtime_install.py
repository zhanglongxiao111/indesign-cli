"""
Runtime installation support for InDesign CLI environment.
"""

import os
from pathlib import Path
from cli_anything.indesign.core.runtime_health import check_edge_availability


def ensure_edge_runtime() -> tuple[bool, str]:
    """Ensure Edge runtime is available or provide installation guidance."""
    ok, msg = check_edge_availability()
    if ok:
        return True, msg
    
    return False, "Edge runtime not found. Please install Microsoft Edge or WebView2 runtime manually."
