"""Build OKF stub pages from converted Markdown — extraction only, never invention."""

from .yamlsafe import yaml_str

BANNER = "> [!NOTE] {{auto-extracted from source — not yet distilled}}"
NO_OUTLINE = "> [!NOTE] {{auto-extracted from source — no outline was extracted; distillation pending}}"


def extract_headings(markdown: str) -> list[str]:
    """Return ATX headings exactly as written, skipping fenced code blocks."""
    out: list[str] = []
    in_fence = False
    for line in markdown.splitlines():
        stripped = line.strip()
        if stripped.startswith("```") or stripped.startswith("~~~"):
            in_fence = not in_fence
            continue
        if not in_fence and line.lstrip().startswith("#"):
            text = line.strip()
            if text.lstrip("#").startswith(" ") or set(text) == {"#"}:
                out.append(text)
    return out


def build_stub(*, title: str, raw_path: str, headings: list[str], timestamp: str) -> str:
    front = (
        "---\n"
        "type: concept\n"
        f"title: {yaml_str(title)}\n"
        "status: stub\n"
        f"timestamp: {timestamp}\n"
        f"resource: {yaml_str(raw_path)}\n"
        "---\n"
    )
    outline = (BANNER + "\n\n" + "\n\n".join(headings) + "\n") if headings else (NO_OUTLINE + "\n")
    citations = f"\n# Citations\n\n- `{raw_path}`\n"
    return front + "\n" + outline + citations
