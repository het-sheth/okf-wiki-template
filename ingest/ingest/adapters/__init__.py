from .docling import DoclingAdapter
from .markitdown import MarkItDownAdapter

_REGISTRY = {a.name: a for a in (MarkItDownAdapter, DoclingAdapter)}


def get_adapter(name: str):
    if name not in _REGISTRY:
        raise ValueError(f"unknown engine '{name}'; choose one of {sorted(_REGISTRY)}")
    return _REGISTRY[name]()
