import pytest

from ingest.draft import extract_headings, build_stub


def test_extract_headings_verbatim():
    md = "# Title\n\nsome prose\n\n## Section A\ntext\n### Sub\n"
    assert extract_headings(md) == ["# Title", "## Section A", "### Sub"]


def test_extract_headings_ignores_hash_inside_code_fence():
    md = "# Real\n\n```\n# not a heading\n```\n## Also Real\n"
    assert extract_headings(md) == ["# Real", "## Also Real"]


def test_build_stub_with_headings_is_strict_profile():
    out = build_stub(title="Deck", raw_path="raw/system-design/deck.md",
                     headings=["# Deck", "## Intro"], timestamp="2026-06-27T00:00:00Z",
                     status="draft")
    assert "type: concept" in out
    assert "status: draft" in out
    assert 'resource: "raw/system-design/deck.md"' in out   # YAML-quoted
    assert 'generated: { by: "tool:ingest", at: "2026-06-27T00:00:00Z" }' in out
    assert "timestamp:" not in out
    assert "topic:" not in out          # dialect field dropped
    assert "sources:" in out            # v0.2 replaces the Citations heading
    assert "# Citations" not in out
    assert "[^raw-source]" in out       # the source must be referenced, not just declared
    assert "raw/system-design/deck.md" in out
    assert "auto-extracted from source - not yet distilled" in out
    assert "# Deck" in out and "## Intro" in out


def test_build_stub_quotes_titles_with_special_characters():
    out = build_stub(title="Foo: Bar #1", raw_path="raw/t/x.md",
                     headings=[], timestamp="2026-06-27T00:00:00Z", status="draft")
    assert 'title: "Foo: Bar #1"' in out


def test_build_stub_without_headings_emits_no_outline_banner_and_no_invented_headings():
    out = build_stub(title="Talk", raw_path="raw/system-design/talk.md",
                     headings=[], timestamp="2026-06-27T00:00:00Z", status="draft")
    assert "no outline was extracted" in out
    # no heading is fabricated in the body; the Citations heading is gone under v0.2
    body = out.split("---", 2)[-1]
    headings = [ln for ln in body.splitlines() if ln.startswith("#")]
    assert headings == []


def test_stub_requires_a_status():
    with pytest.raises(ValueError):
        build_stub(title="T", raw_path="r.md", headings=[], timestamp="t", status="")
