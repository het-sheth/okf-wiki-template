---
type: concept
title: Writing concepts
description: Rules for authoring concept pages in this wiki.
tags:
  - okf
  - authoring
status: stable
legacy_timestamp: 2026-06-27T00:00:00.000Z
sources:
  - id: docs-superpowers-specs-2026
    resource: docs/superpowers/specs/2026-06-27-okf-wiki-template-design.md
    title: This template's design spec
---

One concept per file. Required frontmatter is `type`; recommended: `title`, `description`,
`tags`. Provenance goes under `generated: { by, at }`, not a bare
`timestamp`.[^docs-superpowers-specs-2026] Use an absolute, repo-root link to point back to
the [welcome page](/wiki/getting-started/welcome.md).

External sources are declared in frontmatter under `sources:` and referenced from the body
by a footnote marker, not under a `# Citations` heading. To cite source material under
`raw/`, reference it as inline code like `raw/getting-started/notes.md`.

[^docs-superpowers-specs-2026]: `docs/superpowers/specs/2026-06-27-okf-wiki-template-design.md`
