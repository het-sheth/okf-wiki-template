"""Converter adapter interface. Each engine turns a source file into Markdown."""
from pathlib import Path
from typing import Protocol


class Adapter(Protocol):
    name: str

    def version(self) -> str: ...
    def convert(self, path: Path) -> str: ...
