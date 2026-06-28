"""`python -m ingest <src> --topic <t> [--engine ...] [--title ...]`."""
import argparse
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from .adapters import get_adapter
from .draft import build_stub, extract_headings
from .normalize import needs_normalize, normalize
from .rawstore import RawCollision, write_raw
from .slug import slugify

TEXT_EXTS = {".md", ".markdown", ".txt"}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="ingest")
    parser.add_argument("src")
    parser.add_argument("--topic", required=True)
    parser.add_argument("--engine", choices=["markitdown", "docling"], default="markitdown")
    parser.add_argument("--title")
    parser.add_argument("--wiki-root", default=str(Path(__file__).resolve().parents[2]))
    args = parser.parse_args(argv)

    src = Path(args.src)
    if not src.exists():
        print(f"error: source not found: {src}", file=sys.stderr)
        return 2

    root = Path(args.wiki_root)
    slug = slugify(args.title or src.name)
    title = args.title or slug

    # 1. convert (already-text sources pass through verbatim)
    if src.suffix.lower() in TEXT_EXTS:
        markdown = src.read_text()
        engine_name, engine_version = "passthrough", "0"
    else:
        adapter = get_adapter(args.engine)
        engine_name, engine_version = adapter.name, adapter.version()
        with tempfile.TemporaryDirectory() as td:
            to_convert = normalize(src, Path(td)) if needs_normalize(src) else src
            markdown = adapter.convert(to_convert)

    # 2. write raw (atomic, provenance, collision-guarded)
    try:
        raw_path = write_raw(root=root, topic=args.topic, slug=slug, markdown=markdown,
                             original_filename=src.name, engine=engine_name,
                             engine_version=engine_version)
    except RawCollision as e:
        print(f"error: {e}", file=sys.stderr)
        return 3
    rel_raw = str(Path(raw_path).relative_to(root))

    # 3. auto-draft stub only if the wiki page does not exist yet
    wiki_page = root / "wiki" / args.topic / f"{slug}.md"
    if wiki_page.exists():
        print(f"raw written: {rel_raw}; wiki page exists, leaving it untouched: {wiki_page.relative_to(root)}")
        return 0
    wiki_page.parent.mkdir(parents=True, exist_ok=True)
    stub = build_stub(
        title=title,
        raw_path=rel_raw,
        headings=extract_headings(markdown),
        timestamp=datetime.now(timezone.utc).isoformat(),
    )
    wiki_page.write_text(stub)
    print(f"raw written: {rel_raw}; stub drafted: {wiki_page.relative_to(root)}")
    return 0
