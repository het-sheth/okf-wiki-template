"""Serialize a string as a safe double-quoted YAML scalar."""


def yaml_str(value: str) -> str:
    escaped = str(value).replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"'
