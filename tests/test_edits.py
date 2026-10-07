import sys

import pytest

from agent import edits


@pytest.fixture
def repo(tmp_path):
    (tmp_path / "pkg").mkdir()
    (tmp_path / "pkg" / "__init__.py").write_text("")
    (tmp_path / "pkg" / "core.py").write_text("def add(a, b):\n    return a + b\n\n\ndef sub(a, b):\n    return a + b\n")
    (tmp_path / "tests").mkdir()
    (tmp_path / "tests" / "test_core.py").write_text("from pkg.core import add\n\n\ndef test_add():\n    assert add(1, 2) == 3\n")
    return tmp_path


def proposal(search="def sub(a, b):\n    return a + b", replace="def sub(a, b):\n    return a - b",
             path="pkg/core.py", test_path="tests/test_sub.py",
             test="from pkg.core import sub\n\n\ndef test_sub():\n    assert sub(3, 1) == 2\n"):
    return {"explanation": "x", "edits": [{"path": path, "search": search, "replace": replace}],
            "new_test": {"path": test_path, "content": test}}


def check(repo, originals):
    return edits.check(repo, originals, sys.executable, repo)


def test_valid_edit_applies_and_imports_verify(repo):
    originals = edits.apply(repo, proposal(test="import json\nfrom pkg.core import sub\n\n\ndef test_sub():\n    assert sub(3, 1) == 2\n"))
    assert "return a - b" in (repo / "pkg" / "core.py").read_text()
    assert check(repo, originals) == ["json (stdlib)", "pkg.core.sub (repo)"]


@pytest.mark.parametrize("search", ["return a + b", "return a * b", ""])  # matches twice, zero times, empty
def test_search_must_match_exactly_once(repo, search):
    with pytest.raises(edits.EditError, match="exactly once"):
        edits.apply(repo, proposal(search=search))


@pytest.mark.parametrize("path", ["tests/test_core.py", "conftest.py", "tests/helpers.py"])
def test_existing_tests_are_locked(repo, path):
    with pytest.raises(edits.EditError, match="locked"):
        edits.apply(repo, proposal(path=path, search="add"))


def test_new_test_cannot_overwrite_existing_test(repo):
    with pytest.raises(edits.EditError, match="already exists"):
        edits.apply(repo, proposal(test_path="tests/test_core.py"))


@pytest.mark.parametrize("path", ["../outside.py", "C:/Windows/x.py", ".git/hooks/pre-commit"])
def test_paths_outside_repo_rejected(repo, path):
    with pytest.raises(edits.EditError):
        edits.apply(repo, proposal(path=path))


def test_invented_import_rejected(repo):
    originals = edits.apply(repo, proposal(test="import made_up_pkg\n\n\ndef test_x():\n    assert True\n"))
    with pytest.raises(edits.EditError, match="made_up_pkg"):
        check(repo, originals)


def test_invented_name_in_repo_module_rejected(repo):
    originals = edits.apply(repo, proposal(test="from pkg.core import multiply\n\n\ndef test_x():\n    assert True\n"))
    with pytest.raises(edits.EditError, match="multiply"):
        check(repo, originals)


def test_syntax_error_rejected(repo):
    originals = edits.apply(repo, proposal(replace="def sub(a, b:\n    return a - b"))
    with pytest.raises(edits.EditError, match="syntax error"):
        check(repo, originals)


def test_fixing_a_file_that_had_a_syntax_error(repo):
    (repo / "pkg" / "broken.py").write_text("import json\nif True\n    x = 1\n")
    originals = edits.apply(repo, proposal(path="pkg/broken.py", search="if True\n", replace="if True:\n",
                                           test="def test_x():\n    assert True\n"))
    assert check(repo, originals) == ["json (stdlib)"]


def feature(new_files, edits_=()):
    return {"explanation": "x", "edits": list(edits_), "new_files": new_files,
            "new_test": {"path": "tests/test_mul.py",
                         "content": "from pkg.calc import mul\n\n\ndef test_mul():\n    assert mul(2, 3) == 6\n"}}


CALC = {"path": "pkg/calc.py", "content": "from pkg.core import add\n\n\ndef mul(a, b):\n    return a * b\n"}


def test_feature_may_create_new_source_files(repo):
    originals = edits.apply(repo, feature([CALC]), allow_new_files=True)
    assert originals == {"pkg/calc.py": None, "tests/test_mul.py": None}
    assert check(repo, originals) == ["pkg.core.add (repo)", "pkg.calc.mul (repo)"]


def test_new_files_refused_for_a_bug_fix(repo):
    with pytest.raises(edits.EditError, match="not allowed for a bug fix"):
        edits.apply(repo, feature([CALC]))
    assert not (repo / "pkg" / "calc.py").exists()


@pytest.mark.parametrize("path, message", [("pkg/core.py", "already exists"), ("tests/helper.py", "must not contain tests"),
                                           ("conftest.py", "must not contain tests"), ("../evil.py", "outside")])
def test_new_files_rules(repo, path, message):
    with pytest.raises(edits.EditError, match=message):
        edits.apply(repo, feature([{**CALC, "path": path}]), allow_new_files=True)


def test_new_file_with_invented_import_rejected(repo):
    bad = {**CALC, "content": "import made_up_pkg\n\n\ndef mul(a, b):\n    return a * b\n"}
    originals = edits.apply(repo, feature([bad]), allow_new_files=True)
    with pytest.raises(edits.EditError, match="made_up_pkg"):
        check(repo, originals)


def test_feature_needs_some_change(repo):
    with pytest.raises(edits.EditError, match="no edits proposed"):
        edits.apply(repo, feature([]), allow_new_files=True)


def test_crlf_file_keeps_its_line_endings(repo):
    target = repo / "pkg" / "core.py"
    target.write_bytes(target.read_bytes().replace(b"\r\n", b"\n").replace(b"\n", b"\r\n"))
    edits.apply(repo, proposal())
    data = target.read_bytes()
    assert b"return a - b\r\n" in data and b"\r\r\n" not in data and data.count(b"\n") == data.count(b"\r\n")
