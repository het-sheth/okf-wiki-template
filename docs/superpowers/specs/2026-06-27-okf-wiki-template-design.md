# OKF Wiki Template — Design Spec

**Date:** 2026-06-27
**Status:** Approved design, pre-implementation
**Author:** Het (with Claude)

## Goal

Build a **public, clone-based GitHub template repository** — `okf-wiki-template` — that is a
faithful **strict OKF profile** of the Markdown-canonical LLM-wiki pattern Het has been using across
`education-wiki`, `ios-dev-wiki`, `voice-ai-wiki`, and `course-wiki`. ("Strict OKF profile" = every
bundle the template produces is valid Google OKF v0.1, but the template's own `check` is
*intentionally stricter* than base OKF — see "Bundle scope & link roots" and "What stays". A bundle
that is OKF-valid but violates the template's extra rules will fail `npm run check`; that is by
design.)

Anyone (Het or the public) creates a new wiki by clicking **"Use this template"** (or cloning),
renaming a couple of obvious things, and writing pages. No generator script. The template is the
**canonical seed**; once cloned, each wiki **owns and maintains its own infra independently** (this
matches today's reality — there is no infra-sharing mechanism; each existing wiki already carries
its own copy of `build.mjs`/`lib/okf.mjs` and they have drifted).

## Background: why this exists

- "OKF" is **Open Knowledge Format**, an open spec **published by Google Cloud on 2026-06-12 (v0.1)**:
  `github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md`. It formalizes the
  LLM-wiki pattern into a portable, vendor-neutral Markdown standard for giving AI agents curated
  context.
- Het's existing wikis are **valid-but-dialect OKF**: they meet every OKF MUST (YAML frontmatter +
  non-empty `type` on every concept) but diverge on several SHOULDs — most importantly they use
  `[[wikilinks]]` (not standard Markdown links), put frontmatter on `index.md` (OKF reserves it as a
  no-frontmatter directory listing), and use `sources:`/`created:`/`updated:` instead of
  `resource`/`timestamp`/`# Citations`.
- This template is the chance to ship a **strict, dialect-free** version as the canonical public seed.

## OKF v0.1 conformance requirements (the target)

From the spec:

**MUST:**
- Every non-reserved `.md` file has parseable YAML frontmatter delimited by `---`.
- Every frontmatter block contains a non-empty `type` field.
- Reserved filenames (`index.md`, `log.md`) follow their structures when present.
- Consumers must tolerate missing optional fields, unknown `type` values, unknown keys, broken
  links, and missing `index.md`.

**SHOULD:**
- Cross-link with **standard Markdown links**, preferring **absolute bundle-relative** (`/path.md`).
- Populate `title`, `description`, `resource`, `tags`, `timestamp` (ISO 8601).
- Favor structural Markdown (headings, lists, tables, code blocks).
- Use conventional section headings (`# Schema`, `# Examples`, `# Citations`); list external
  sources under `# Citations`.
- `index.md` = a directory listing for progressive disclosure, **no frontmatter**, with entry
  descriptions drawn from linked concepts.
- `log.md` = chronological update history, **no frontmatter**.

**Reserved fields:** `type` (required), `title`, `description`, `resource`, `tags`, `timestamp`.
Custom keys are permitted.

## Design decisions

| Decision | Choice |
|---|---|
| Form | Public GitHub **template repository**, clone-based ("Use this template"). **No generator.** |
| Conformance | **Strict OKF profile** — every bundle is OKF v0.1-valid; `check` is intentionally stricter. Not Het's existing dialect. |
| Agent doc | **`AGENTS.md` is canonical**; `CLAUDE.md` is a one-line shim (`@AGENTS.md`). |
| Infra ownership | Template = canonical seed. Each clone maintains its own infra; **no sync mechanism**. |
| Python ingest | **Optional**, kept in-repo, with a documented one-line removal for lean wikis. |
| Namespace | Personal: **`github.com/het-sheth`** (via `GH_HOST=github.com`). NOT `hetsheth-droid` (work). |
| Publishing | Final, **separately-confirmed** step. Do not push public without explicit go-ahead. |

## Bundle scope & link roots

These definitions resolve what `check` validates and how links resolve. They are authoritative; any
other section defers to this one.

- **Bundle root = repo root.** The OKF bundle is the repository. `wiki/`, `raw/`, and (optional)
  `log.md` files are bundle content; `build.mjs`, `lib/`, `test/`, `assets/`, `ingest/`, and the
  docs/meta files are tooling that ships alongside but is **not** OKF content.
- **OKF validation scope = `wiki/**` and `raw/**` only.** `npm run check` applies OKF concept rules
  (frontmatter + non-empty `type`, link resolution, reserved-file rules) **only** to Markdown under
  `wiki/` and `raw/`. It **never** validates `README.md`, `AGENTS.md`, `CLAUDE.md`, or `docs/**` —
  those are repo meta, not concepts.
- **Absolute links are repo-root-relative.** An author writes `[Label](/wiki/getting-started/welcome.md)`.
  A leading `/` means "from repo root." Relative links (`./welcome.md`, `../other/x.md`) are also
  allowed and resolve normally. `build.mjs` rewrites local `.md` targets → the corresponding
  `site/.../*.html` path; `check` fails (non-zero exit) if a local `.md` target does not exist.
- **Reserved files (OKF):** `index.md` and `log.md` carry **no frontmatter** and are exempt from the
  `type` requirement. Everything else under `wiki/`/`raw/` is a concept and MUST have frontmatter +
  `type`.

## Repository structure

```
okf-wiki-template/
  AGENTS.md            canonical: OKF profile, body conventions, no-invent rule, layout, ops
  CLAUDE.md            shim → "@AGENTS.md"
  README.md            human onboarding: what OKF is (+ spec link), how to use template, rename steps
  package.json         name read by build.mjs; deps: gray-matter, marked
  package-lock.json
  .gitignore           ignores site/, node_modules/, ingest/.venv
  build.mjs            site generator — reworked for strict OKF (see below)
  lib/okf.mjs          pure helpers — reworked link extraction + type validation
  topics.json          example: { "order": ["getting-started"] }
  assets/wiki.css      verbatim from education-wiki
  test/
    okf.test.mjs       unit tests for lib helpers (strict rules)
    build-check.test.mjs   scaffolds/validates the example bundle end-to-end
  wiki/getting-started/
    index.md           OPTIONAL, NO frontmatter — intro prose only; listing is auto-generated
    welcome.md         type: concept, standard md links, # Citations section — worked example
  raw/.gitkeep
  ingest/              OPTIONAL python pipeline (pyproject.toml, uv.lock, tests, fixtures)
  scripts/ingest.mjs   OPTIONAL ingest CLI wrapper
  docs/superpowers/specs/2026-06-27-okf-wiki-template-design.md   (this file)
```

## Infra rework — strict OKF (the substantive work)

This is **not** a copy of `education-wiki`'s `build.mjs`. Three concrete changes:

### 1. Links: standard Markdown, not `[[wikilinks]]`
- Authors write `[Label](/getting-started/welcome.md)` (bundle-relative, OKF-recommended) or
  `[Label](./welcome.md)` (relative).
- `build.mjs` rewrites local `.md` link targets → `.html` when generating `site/`.
- `npm run check` validates every **local** `.md` link target exists (external `http(s)` links are
  left alone; an unresolved local link **fails** `check` with a non-zero exit — even though OKF
  itself *tolerates* broken links, the wiki is stricter than the spec on purpose, matching the
  behavior of Het's existing wikis).
- `extractWikilinks`/`preprocessWikilinks` are replaced with standard-link extraction/rewriting.
- The `related:` frontmatter field is **dropped** — OKF expresses relationships as in-prose links.

### 2. `index.md`: reserved, no-frontmatter, listing auto-generated
- `index.md` is **optional** and carries **no frontmatter** (it is an OKF reserved file).
- The topic landing page's **concept listing is ALWAYS generated by `build.mjs`** from the concept
  files in that directory (reading each concept's `title` + `description`). This is the single source
  of truth for the listing — authors never hand-maintain it.
- If `index.md` is present, its body supplies **intro prose only**, rendered above the generated
  listing. If absent, `build.mjs` generates the whole landing page.
- The old `check` rule "index.md must have `type: topic`" is **removed**; replaced with "index.md, if
  present, must have **no** frontmatter" (per OKF reserved-file rules).

### 3. Fields + citations align to spec
- Frontmatter on a concept: `type` (required), `title`, `description`, `tags`, `timestamp` (ISO
  8601), `resource` (optional URI of the underlying source asset). `status` is retained as a
  permitted custom key (useful stub→solid lifecycle signal).
- `created`/`updated` → consolidated into `timestamp`.
- External sources move from a `sources:` frontmatter array to a body **`# Citations`** section
  (OKF SHOULD). The auto-generated `## References` / `## Related` HTML sections are removed; what the
  author writes in the body is what renders.
- `build.mjs` no longer hardcodes a wiki name (today `education-wiki`'s build hardcodes
  `· education-wiki` in the HTML `<title>`/brand). The name is read from `package.json`.

### 4. `log.md`: adopt OKF's reserved file; drop the `type: log` convention
- The template adopts OKF's reserved **`log.md`** (optional, **no frontmatter**, chronological update
  history, may appear in any bundle directory). It is exempt from the `type` requirement.
- Het's existing `log/<date>-<topic>.md` dated-entry convention (with `type: log` frontmatter) is
  **dropped** from the template — it conflicts with OKF's reserved-file rule. There is no `log/`
  directory in the template; `log.md` lives wherever it is relevant.

### What stays
- The **inviolable no-invention rule** — verbatim. It is Het's discipline, not OKF's, and the most
  valuable thing carried forward.
- Strict per-path `type` validation for concepts: `raw/**` → `source`; `wiki/<topic>/<slug>.md` →
  `concept` | `pattern` | `worked-example`. This is *stricter* than base OKF (which only requires the
  field to be non-empty) — hence "strict OKF profile". Reserved `index.md`/`log.md` are exempt.
- GitHub-style alert callouts, `title="..."` code blocks, deterministic no-LLM build.

## Documentation

- **`AGENTS.md`** (canonical): the OKF profile table, frontmatter schema, body conventions, layout,
  operations (build/check/test, optional ingest), and the no-invent rule. Written so any agent
  dropped into a fresh clone knows every rule immediately.
- **`CLAUDE.md`**: a single line — `@AGENTS.md` — matching Het's own global CLAUDE.md import pattern.
- **`README.md`** (human): one-paragraph "what is OKF" + link to Google's spec; "How to use this
  template" (Use-this-template → rename `package.json` name + `topics.json` + README title → `npm
  install` → `npm run check`); the optional-ingest section with its **exact removal** (delete
  `ingest/` and `scripts/ingest.mjs`, then remove the `"ingest"` line from `package.json` `scripts`);
  the build/check/test loop; a note that this is a strict OKF profile (dialect-free) and why.

## Tooling & environment

- **Node ≥ 20** (declared in `package.json` `engines`); `node --test` is the only test runner. Deps:
  `gray-matter`, `marked` (pinned).
- **Optional ingest**: Python via **`uv`** (latest); `pyproject.toml` + `uv.lock` pin the rest.
- **Accessibility baseline (light, not a hard gate):** generated HTML includes `lang`, `charset`,
  `viewport`, and semantic landmarks (`header`/`main`). Full WCAG/W3C validation is **out of scope**
  for this template.

## Testing (the pass/fail signal)

- `npm run check` on the bundled example produces **zero violations**.
- `npm run build` regenerates `site/`. "Valid HTML" here means: the build exits 0, every generated
  page parses (well-formed, has `<!DOCTYPE>`/`<head>`/`<body>`), and **every internal link resolves**
  to a generated file. Not W3C-validated, not snapshot-tested.
- `npm test` (`node --test`) runs:
  - `okf.test.mjs` — unit tests for the reworked link extraction and `typeViolation` logic.
  - `build-check.test.mjs` — validates the example bundle end-to-end and asserts **OKF conformance**
    (every concept has a non-empty `type`; every local Markdown link resolves; `index.md` has no
    frontmatter).
- (If ingest is touched: `cd ingest && uv run --extra dev pytest`.)

Exit code is the only signal — no eyeballing.

## Publishing (final, separately confirmed)

1. `git init` at `~/personal/okf-wiki-template`; branch + Conventional Commits; no Co-Authored-By.
2. Create the repo under **`github.com/het-sheth`** with `GH_HOST=github.com`, **public**, and mark
   it a **template repository** (`gh repo edit --template` or the API `is_template` flag).
3. **Do not push without Het's explicit go-ahead.** Until then the repo stays local.

## Out of scope (YAGNI)

- A generator script / placeholder substitution (clone + manual rename is enough).
- An infra-sync mechanism between the template and existing wikis (each owns its infra).
- Migrating the 4 existing wikis to strict OKF (separate, later effort if desired).
- Hosting/deploying `site/` anywhere (generated locally; `site/` is gitignored).

## Resolved in review (Codex, 2026-06-27)

- **Bundle root** = repo root; absolute links are `/wiki/...`. (see "Bundle scope & link roots")
- **Validation scope** = `wiki/**` + `raw/**` only; meta files (`README`/`AGENTS`/`CLAUDE`/`docs`)
  are never OKF-validated.
- **`index.md`** = optional, no frontmatter, intro prose only; listing always auto-generated.
- **`log.md`** = OKF reserved file (no frontmatter); the `type: log` dated-entry convention is dropped.
- **"strict OKF profile"** naming clarifies the checker is intentionally stricter than base OKF.
- Tooling versions, "valid HTML" definition, accessibility baseline, and exact ingest-removal steps
  are now specified.

## Open questions

None blocking. Migration of the existing wikis to match the strict template is explicitly deferred.
