from importlib.metadata import version as _pkg_version
from pathlib import Path


class MarkItDownAdapter:
    name = "markitdown"

    def version(self) -> str:
        return _pkg_version("markitdown")

    def convert(self, path: Path) -> str:
        from markitdown import MarkItDown
        return MarkItDown().convert(str(path)).text_content
