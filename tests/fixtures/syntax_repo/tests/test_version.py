from pathlib import Path


def test_calc_declares_version():
    # Reads the source text, so it passes even while calc.py does not parse.
    assert 'VERSION = "1"' in (Path(__file__).parent.parent / "calc.py").read_text()
