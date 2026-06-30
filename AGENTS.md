# OKF Wiki — schema & conventions (canonical agent doc)

A Markdown-canonical knowledge base conforming to a **strict OKF profile** (Google Open Knowledge
Format v0.1). **Markdown in `wiki/` is the source of truth. `site/` is generated — never edit it by hand.**

## Layout
- `wiki/<topic>/<slug>.md` — atomic concept pages (one concept per file). Slugs are kebab-case.
- `wiki/<topic>/index.md` — OPTIONAL, reserved, **no frontmatter**: intro prose for the topic. The
  card listing is auto-generated from the concept files.
- `raw/<topic>/` — immutable source material. Read, never rewrite.
- `topics.json` — `{ "order": [...] }` controls topic order on the hub.
- `build.mjs` — `npm run build` regenerates `site/`; `npm run check` validates without writing.

## Concept frontmatter (required: `type`)
```
---
type: concept           # required. wiki concepts: concept | pattern | worked-example
title: Human Title      # recommended
description: one-sentence summary    # recommended; canonical summary field
tags: [a, b]            # recommended
timestamp: 2026-06-27T00:00:00Z      # recommended; ISO 8601, last meaningful change
resource: https://...   # optional; URI of the underlying asset
status: stub | learning | researched | solid   # optional custom lifecycle key
---
```

## Reserved files (OKF)
- `index.md` and `log.md` carry **NO frontmatter**. `index.md` = intro prose (listing is generated).
  `log.md` = chronological update history. Both are exempt from the `type` requirement.

## Body conventions the generator understands
- Cross-link **concepts** with **standard Markdown links**: `[Label](/wiki/<topic>/<slug>.md)`
  (absolute, repo-root-relative — preferred) or `[Label](./<slug>.md)` (relative). A link must
  resolve to an existing concept; to cite `raw/` source material, reference it as inline code
  (`` `raw/<topic>/file.md` ``) or via `resource:` — not as a clickable link.
- **Wikilinks** (within this wiki): `[[slug]]`, `[[topic/slug]]`, `[[slug|Label]]` →
  cross-links. Bare `[[slug]]` resolves against the current page's topic. Must resolve to an
  existing concept or `check` fails.
- **Cross-wiki wikilinks** (into a *federated peer* wiki): `[[<peer>:<topic>/<slug>]]` and
  `[[<peer>:<topic>/<slug>|Label]]`. Peer name **and** full `topic/slug` are both required — no
  bare-slug, no peerless form (`check` rejects malformed forms). Cross-wiki rendering is **opt-in
  per wiki, default OFF** (`okf.federation: true` in `package.json` + a discoverable `peers.json`
  via `OKF_PEERS` or the sibling `../knowledge-hub/peers.json`). With federation OFF the link is
  still parsed and **masked** — the human `Label` (or `(linked page)`) renders, never the
  peer/topic/slug. With it ON the link resolves to a relative href into the peer's local `site/`.
- External sources go under a `# Citations` heading in the body — NOT in frontmatter.
- `> [!TIP]` / `[!NOTE]` / `[!WARNING]` / `[!CAUTION]` / `[!IMPORTANT]` → callouts.
- ` ```lang title="…" ` → code block with a head bar. Tables, lists, headings → standard Markdown.

## The one inviolable rule: never invent content
Pages capture only what was in the source material (`raw/`) or what the author provided. Ground every
claim in `raw/` or a cited source. Flag third-party/unverified claims inline (e.g. "{{partly third-party}}").
Missing material → leave a `status: stub` with a note, don't fabricate.

## OKF profile (enforced by `npm run check`)
Frontmatter/`type` rules apply to `wiki/**` and `raw/**` (never `README`/`AGENTS`/`CLAUDE`/`docs`/`ingest`).
Link resolution applies to `wiki/` concept bodies only (raw/ is not link-validated).

| Path | required `type` |
|------|------|
| `raw/**/*.md` | `source` |
| `wiki/<topic>/<slug>.md` | `concept` \| `pattern` \| `worked-example` |
| `wiki/**/index.md`, `**/log.md` | reserved — **no frontmatter** |

`check` fails on: missing/wrong `type` on a concept, wrong `type` on a raw doc, frontmatter on a
reserved file, a topic in `topics.json` with no `wiki/<topic>/` directory, a body `.md` link that
does not resolve to a wiki concept, a within-wiki `[[wikilink]]` to a non-existent page, or a
malformed cross-wiki wikilink. A cross-wiki link to a missing peer page fails check **only when
federation is on and the peer manifest is present** — with federation off, cross-wiki links are
masked, not resolved, and not checked, so the wiki still builds standalone. This profile is
*stricter* than base OKF on purpose; every bundle it accepts is still valid OKF v0.1.

## Federation manifest (`site/manifest.json`)
Every `npm run build` writes `site/manifest.json` (deterministic, no LLM) describing this wiki for
the local knowledge hub: `wiki`, `title`, and `pages[]` each with `id` (=`topic/slug`), `title`,
`topic`, `type`, `description`, `tags`, `href` (relative to this wiki's `site/`), and `links` (the
page's outgoing `[[<peer>:<topic>/<slug>]]` references — what lets the hub build backlinks).

## Operations
- **Build:** `npm run build`. **Lint:** `npm run check`. **Test:** `npm test`.
- **Optional ingest** (if `ingest/` is present): `npm run ingest -- <src> --topic <t>`. See README.
