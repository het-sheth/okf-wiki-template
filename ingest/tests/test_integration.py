import json
import shutil
import pytest
from pathlib import Path
from ingest.cli import main

FIX = Path(__file__).resolve().parents[1] / "fixtures"


def _run(tmp_path, src, engine, okf=None):
    for d in ("raw", "wiki"):
        (tmp_path / d).mkdir(parents=True, exist_ok=True)
    if okf is not None:
        (tmp_path / "package.json").write_text(json.dumps({"name": "t", "okf": okf}))
    return main([str(src), "--topic", "test", "--engine", engine, "--wiki-root", str(tmp_path)])


def test_headingless_source_yields_no_outline_banner(tmp_path):
    code = _run(tmp_path, FIX / "headingless.txt", "markitdown")
    assert code == 0
    stub = (tmp_path / "wiki/test/headingless.md").read_text()
    assert "no outline was extracted" in stub
    # no heading is fabricated in the body; the Citations heading is gone under v0.2
    body = stub.split("---", 2)[-1]
    headings = [ln for ln in body.splitlines() if ln.startswith("#")]
    assert headings == []


def test_missing_package_json_uses_the_legacy_default_status(tmp_path):
    _run(tmp_path, FIX / "headingless.txt", "markitdown")
    stub = (tmp_path / "wiki/test/headingless.md").read_text()
    assert "status: stub" in stub
    assert "timestamp:" not in stub


def test_configured_status_default_is_used(tmp_path):
    _run(tmp_path, FIX / "headingless.txt", "markitdown",
         okf={"statusValues": ["draft", "stable", "deprecated"], "statusDefault": "stable"})
    stub = (tmp_path / "wiki/test/headingless.md").read_text()
    assert "status: stable" in stub
    assert "timestamp:" not in stub


def test_status_values_without_default_prefers_stable(tmp_path):
    _run(tmp_path, FIX / "headingless.txt", "markitdown",
         okf={"statusValues": ["draft", "stable", "deprecated"]})
    stub = (tmp_path / "wiki/test/headingless.md").read_text()
    assert "status: stable" in stub
    assert "timestamp:" not in stub


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
