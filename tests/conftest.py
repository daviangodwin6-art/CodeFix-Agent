import sys
from pathlib import Path

import pytest

from agent import projects, runner

collect_ignore = ["fixtures"]  # fixture repos are inputs for the agent, not part of this suite


def pytest_configure(config):
    config.addinivalue_line("markers", "real_env: build real project venvs (slow) instead of the stand-in below")


@pytest.fixture(autouse=True)
def codefix_home(tmp_path, monkeypatch, request):
    """Every test gets its own CODEFIX_HOME, so nothing is ever written to the real projects/ or data/.

    Building a venv costs 10 to 20 seconds, so unless a test is marked real_env the venv BUILD is replaced
    by a stand-in that runs the tests with this suite's own interpreter. Everything around the build (one
    venv folder per project, the .ready marker, the dependency hash, eviction) is the real code.
    Returns the list of venv folders "built" so far.
    """
    monkeypatch.setenv("CODEFIX_HOME", str(tmp_path / "codefix_home"))
    monkeypatch.setenv("LLM_PROVIDER", "fake")
    monkeypatch.delenv("FAKE_LLM_FILE", raising=False)
    monkeypatch.delenv("MAX_CACHED_VENVS", raising=False)
    monkeypatch.setattr(projects, "_busy", set())
    built = []
    if not request.node.get_closest_marker("real_env"):
        def setup_env(repo, venv):
            Path(venv).mkdir(parents=True)
            built.append(Path(venv))
            return Path(sys.executable), ""

        monkeypatch.setattr(runner, "setup_env", setup_env)
        monkeypatch.setattr(runner, "venv_python", lambda venv: Path(sys.executable))
    return built
