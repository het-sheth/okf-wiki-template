# okf-wiki-template

A clone-and-go template for a **strict [OKF](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md)-profile**
Markdown wiki: atomic concept pages with YAML frontmatter, standard Markdown cross-links, a
deterministic Node build to static HTML, and a `check` that enforces the profile. Optional Python
ingest turns PDFs/docs into source pages.

## Use this template
1. Click **"Use this template"** on GitHub (or clone this repo).
2. Rename in three places: `name` in `package.json`, the topic list in `topics.json`, and the title
   of this README.
3. `npm install`
4. Write pages under `wiki/<topic>/`, then `npm run check` and `npm run build`.

## What's an OKF profile?
OKF (Google Cloud, v0.1) is a vendor-neutral Markdown standard for giving AI agents curated context.
This template ships a *strict profile*: every bundle it produces is valid OKF, but `npm run check`
adds extra rules (typed concepts, resolved links, reserved-file discipline) to keep wikis tidy. See
`AGENTS.md` for the full schema and conventions.

## Commands
- `npm run build` — regenerate `site/` (do not hand-edit `site/`).
- `npm run check` — validate the OKF profile; non-zero exit on any violation.
- `npm test` — `node --test` (helper unit tests + end-to-end conformance).

## Layout
- `wiki/<topic>/<slug>.md` — concept pages (canonical).
- `wiki/<topic>/index.md` — optional, no-frontmatter intro prose (listing is auto-generated).
- `raw/<topic>/` — immutable source material.
- `site/` — generated HTML (gitignored).

## Optional: document ingestion
This template includes a Python ingest pipeline (`ingest/`, `scripts/ingest.mjs`) for converting
PDFs/docs into `raw/` source pages via `uv`. **If you don't need it, remove it:**

```bash
rm -rf ingest scripts/ingest.mjs
# then delete the "ingest" line from package.json "scripts"
```

To use it: `npm run ingest -- <source> --topic <topic> --title "..."` (requires
[`uv`](https://docs.astral.sh/uv/)). It writes a `type: source` page to `raw/<topic>/` and drafts a
`status: stub` concept in `wiki/<topic>/` for you to distill.
