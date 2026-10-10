from calc import add
from envdump import dump


def test_add():
    dump("test")
    assert add(2, 3) == 5
