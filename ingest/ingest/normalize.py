"""Normalize legacy binary formats (e.g. .ppt) to converter-readable formats via LibreOffice."""
import shutil
import subprocess
from pathlib import Path

# Legacy formats neither MarkItDown nor Docling reads natively -> convert first.
_LEGACY = {".ppt": "pptx", ".doc": "docx", ".xls": "xlsx"}


def needs_normalize(path: Path) -> bool:
    return path.suffix.lower() in _LEGACY


def normalize(path: Path, out_dir: Path) -> Path:
    """Convert a legacy file to its modern equivalent; return the new path."""
    target_ext = _LEGACY[path.suffix.lower()]
    if shutil.which("soffice") is None:
        raise RuntimeError(
            "LibreOffice (`soffice`) is required to normalize legacy formats "
            f"like {path.suffix}. Install LibreOffice or supply a {target_ext} file."
        )
    out_dir.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["soffice", "--headless", "--convert-to", target_ext, "--outdir", str(out_dir), str(path)],
        check=True, capture_output=True,
    )
    result = out_dir / f"{path.stem}.{target_ext}"
    if not result.exists():
        raise RuntimeError(f"soffice did not produce {result}")
    return result
