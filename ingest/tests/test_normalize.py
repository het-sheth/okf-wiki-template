from pathlib import Path
from ingest.normalize import needs_normalize


def test_legacy_ppt_needs_normalize():
    assert needs_normalize(Path("deck.ppt")) is True
    assert needs_normalize(Path("deck.PPT")) is True


def test_modern_and_other_formats_do_not():
    for name in ["deck.pptx", "paper.pdf", "notes.docx", "page.html", "t.md"]:
        assert needs_normalize(Path(name)) is False
