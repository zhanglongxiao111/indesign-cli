import os

import pytest


@pytest.mark.skipif(
    os.environ.get("INDESIGN_E2E") != "1",
    reason="Set INDESIGN_E2E=1 to run real InDesign tests",
)
def test_real_indesign_e2e_requires_opt_in():
    assert os.environ.get("INDESIGN_E2E") == "1"
