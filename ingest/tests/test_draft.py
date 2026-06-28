from ingest.draft import extract_headings, build_stub


def test_extract_headings_verbatim():
    md = "# Title\n\nsome prose\n\n## Section A\ntext\n### Sub\n"
    assert extract_headings(md) == ["# Title", "## Section A", "### Sub"]


def test_extract_headings_ignores_hash_inside_code_fence():
    md = "# Real\n\n```\n# not a heading\n```\n## Also Real\n"
    assert extract_headings(md) == ["# Real", "## Also Real"]


def test_build_stub_with_headings_is_strict_profile():
    out = build_stub(title="Deck", raw_path="raw/system-design/deck.md",
                     headings=["# Deck", "## Intro"], timestamp="2026-06-27T00:00:00Z")
    assert "type: concept" in out
    assert "status: stub" in out
    assert 'resource: "raw/system-design/deck.md"' in out   # YAML-quoted
    assert "timestamp: 2026-06-27T00:00:00Z" in out
    assert "topic:" not in out          # dialect field dropped
    assert "sources:" not in out        # dialect field dropped
    assert "# Citations" in out
    assert "`raw/system-design/deck.md`" in out
    assert "auto-extracted from source — not yet distilled" in out
    assert "# Deck" in out and "## Intro" in out


def test_build_stub_quotes_titles_with_special_characters():
    out = build_stub(title="Foo: Bar #1", raw_path="raw/t/x.md",
                     headings=[], timestamp="2026-06-27T00:00:00Z")
    assert 'title: "Foo: Bar #1"' in out


def test_build_stub_without_headings_emits_no_outline_banner_and_no_invented_headings():
    out = build_stub(title="Talk", raw_path="raw/system-design/talk.md",
                     headings=[], timestamp="2026-06-27T00:00:00Z")
    assert "no outline was extracted" in out
    # the only heading in the body is the fixed "# Citations" section — nothing fabricated
    body = out.split("---", 2)[-1]
    headings = [ln for ln in body.splitlines() if ln.startswith("#")]
    assert headings == ["# Citations"]
