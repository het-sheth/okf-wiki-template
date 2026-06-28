from importlib.metadata import version as _pkg_version
from pathlib import Path


class DoclingAdapter:
    name = "docling"

    def version(self) -> str:
        return _pkg_version("docling")

    def convert(self, path: Path) -> str:
        from docling.document_converter import DocumentConverter
        result = DocumentConverter().convert(str(path))
        return result.document.export_to_markdown()
