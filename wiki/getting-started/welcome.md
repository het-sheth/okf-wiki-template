---
type: concept
title: Welcome to OKF wikis
description: What this template is and how a concept page is structured.
tags:
  - okf
  - meta
status: stable
legacy_timestamp: 2026-06-27T00:00:00.000Z
sources:
  - id: github-com-googlecloudplatform-knowledge
    resource: >-
      https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md
    title: Open Knowledge Format v0.1
---

This is a **concept** page (one idea per file). Frontmatter carries `type` (required),
plus recommended keys like `title`, `description`, and `tags`; provenance goes under
`generated: { by, at }` rather than a bare `timestamp`. The body is plain
Markdown.[^github-com-googlecloudplatform-knowledge]

Cross-link other concepts with standard Markdown links, e.g. see
[writing concepts](./writing-concepts.md) for the authoring rules.

> [!NOTE]
> `site/` is generated. Edit Markdown in `wiki/`, then run `npm run build`.

[^github-com-googlecloudplatform-knowledge]: https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md
