import pytest
from pathlib import Path
from ingest.rawstore import content_hash, write_raw, RawCollision


def test_content_hash_is_stable():
    assert content_hash("abc") == content_hash("abc")
    assert content_hash("abc") != content_hash("abd")


def test_write_raw_creates_file_with_provenance(tmp_path):
    p = write_raw(root=tmp_path, topic="t", slug="s", markdown="# H\nbody\n",
                  original_filename="x.pdf", engine="docling", engine_version="2.0.0")
    text = Path(p).read_text()
    assert "type: source" in text
    assert 'original_filename: "x.pdf"' in text   # YAML-quoted
    assert "engine: docling" in text
    assert "engine_version: 2.0.0" in text
    assert "content_hash:" in text
    assert text.rstrip().endswith("body")


def test_rewriting_identical_content_is_noop(tmp_path):
    kw = dict(root=tmp_path, topic="t", slug="s", markdown="same\n",
              original_filename="x", engine="markitdown", engine_version="1")
    p1 = write_raw(**kw)
    mtime1 = Path(p1).stat().st_mtime_ns
    p2 = write_raw(**kw)
    assert p1 == p2
    assert Path(p2).stat().st_mtime_ns == mtime1  # not rewritten


def test_different_content_same_slug_raises(tmp_path):
    write_raw(root=tmp_path, topic="t", slug="s", markdown="one\n",
              original_filename="x", engine="m", engine_version="1")
    with pytest.raises(RawCollision):
        write_raw(root=tmp_path, topic="t", slug="s", markdown="two\n",
                  original_filename="x", engine="m", engine_version="1")
