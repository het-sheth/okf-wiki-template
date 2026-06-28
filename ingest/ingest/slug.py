import re
from pathlib import Path


def slugify(value: str) -> str:
    """Lowercase, strip a file extension, replace non-alphanumerics with hyphens."""
    stem = Path(value).stem if "." in Path(value).name else value
    s = stem.lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")
