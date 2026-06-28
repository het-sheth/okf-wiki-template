import shutil
import pytest
from pathlib import Path
from ingest.cli import main

FIX = Path(__file__).resolve().parents[1] / "fixtures"


def _run(tmp_path, src, engine):
    for d in ["wiki/test", "raw/test", "log"]:
        (tmp_path / d).mkdir(parents=True, exist_ok=True)
    return main([str(src), "--topic", "test", "--engine", engine, "--wiki-root", str(tmp_path)])


def test_headingless_source_yields_no_outline_banner(tmp_path):
    code = _run(tmp_path, FIX / "headingless.txt", "markitdown")
    assert code == 0
    stub = (tmp_path / "wiki/test/headingless.md").read_text()
    assert "no outline was extracted" in stub
    # no fabricated headings in the body — the only heading is the fixed "# Citations" section
    body = stub.split("---", 2)[-1]
    headings = [ln for ln in body.splitlines() if ln.startswith("#")]
    assert headings == ["# Citations"]


@pytest.mark.skipif(shutil.which("soffice") is None, reason="LibreOffice not installed")
def test_legacy_ppt_normalizes_and_drafts(tmp_path):
    code = _run(tmp_path, FIX / "final-review-462.ppt", "markitdown")
    assert code == 0
    assert (tmp_path / "raw/test/final-review-462.md").exists()
    assert (tmp_path / "wiki/test/final-review-462.md").exists()


def test_docling_stem_pdf_converts(tmp_path):
    code = _run(tmp_path, FIX / "stem-sample.pdf", "docling")
    assert code == 0
    raw = (tmp_path / "raw/test/stem-sample.md").read_text()
    assert "type: source" in raw and "engine: docling" in raw


def test_reingesting_does_not_clobber_distilled_page(tmp_path):
    _run(tmp_path, FIX / "headingless.txt", "markitdown")
    page = tmp_path / "wiki/test/headingless.md"
    page.write_text("---\ntype: concept\nstatus: solid\n---\nmy real notes\n")
    _run(tmp_path, FIX / "headingless.txt", "markitdown")
    assert "my real notes" in page.read_text()  # untouched
