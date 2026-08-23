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


def build_stub(*, title: str, raw_path: str, headings: list[str], timestamp: str, status: str) -> str:
    if not status:
        raise ValueError(
            "ingest needs a resolvable status: set `okf.statusDefault` in package.json"
        )
    front = (
        "---\n"
        "type: concept\n"
        f"title: {yaml_str(title)}\n"
        f"status: {status}\n"
        f'generated: {{ by: "tool:ingest", at: "{timestamp}" }}\n'
        f"resource: {yaml_str(raw_path)}\n"
        "sources:\n"
        "  - id: raw-source\n"
        f"    resource: {yaml_str(raw_path)}\n"
        f"    title: {yaml_str(title)}\n"
        "---\n"
    )
    outline = (BANNER + "\n\n" + "\n\n".join(headings) + "\n") if headings else (NO_OUTLINE + "\n")
    # The marker keeps the declared source from being orphaned under the v0.2 profile: every
    # declared source id must be referenced from the body. The footnote line is wrapped in inline
    # code, not written as a bare markdown reference-link definition: an unwrapped
    # "[^raw-source]: raw/..." line is valid reference-link-definition syntax, which would make
    # the checker resolve raw/... as a clickable wiki link and fail (raw/ is cited, never linked).
    attribution = (
        f"\nExtracted from the source document.[^raw-source]\n\n"
        f"`[^raw-source]: {raw_path}`\n"
    )
    return front + "\n" + outline + attribution
