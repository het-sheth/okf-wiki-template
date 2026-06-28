from ingest.yamlsafe import yaml_str


def test_yaml_str_quotes_plain_values():
    assert yaml_str("deck") == '"deck"'


def test_yaml_str_quotes_and_escapes_special_chars():
    assert yaml_str("Foo: Bar #1") == '"Foo: Bar #1"'
    assert yaml_str('a "q"') == '"a \\"q\\""'
