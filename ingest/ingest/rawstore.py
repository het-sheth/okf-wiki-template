"""Write converted Markdown into raw/<topic>/<slug>.md with provenance, atomically."""
import hashlib
import os
import re
from pathlib import Path

from .yamlsafe import yaml_str


class RawCollision(Exception):
    """A different source already occupies this slug."""


def content_hash(markdown: str) -> str:
    return hashlib.sha256(markdown.encode("utf-8")).hexdigest()[:16]


def _existing_hash(path: Path) -> str | None:
    if not path.exists():
        return None
    m = re.search(r"^content_hash:\s*(\S+)\s*$", path.read_text(), re.MULTILINE)
    return m.group(1) if m else None


def write_raw(*, root, topic: str, slug: str, markdown: str,
              original_filename: str, engine: str, engine_version: str) -> str:
    out = Path(root) / "raw" / topic / f"{slug}.md"
    digest = content_hash(markdown)
    prior = _existing_hash(out)
    if prior == digest:
        return str(out)  # identical -> no-op
    if prior is not None and prior != digest:
        raise RawCollision(f"{out} already exists with different content ({prior} != {digest})")

    out.parent.mkdir(parents=True, exist_ok=True)
    front = (
        "---\n"
        "type: source\n"
        f"title: {yaml_str(slug)}\n"
        f"original_filename: {yaml_str(original_filename)}\n"
        f"engine: {engine}\n"
        f"engine_version: {engine_version}\n"
        f"content_hash: {digest}\n"
        "---\n\n"
    )
    body = front + markdown.rstrip("\n") + "\n"
    tmp = out.with_suffix(".md.tmp")
    tmp.write_text(body)
    os.replace(tmp, out)  # atomic on POSIX
    return str(out)
