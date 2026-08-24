# OKF Wiki: schema and conventions

A Markdown-canonical knowledge base. Write pages under `wiki/<topic>/`, then run `npm run check`.

<!-- okf-template:profile-min:begin -->
<!-- Managed by `npm run upgrade`. Edit docs/profile-min.md in the template, not here. -->
## OKF profile (normative)

Markdown in `wiki/` is the source of truth; `site/` is generated, never hand-edited.

- Every concept page needs `type`. Allowed values come from `okf.conceptTypes`.
- `timestamp:` is prohibited by this profile. Use `generated: { by, at }`.
- A `# Citations` heading is prohibited. Cite through `sources:` entries, each with an `id`,
  `resource`, and `title`, and reference each one with a `[^id]` footnote marker at the claim it
  supports. A page-level gesture at sources lets a reader check nothing.
- Never invent content. Ground every claim in `raw/` or a cited source. Missing material stays a
  stub with the gap stated, never filled in from guesswork.
- Cross-link concepts with Markdown links or `[[wikilinks]]`; every link must resolve.
- Reserved files (`index.md`, `log.md`) carry no frontmatter, except `wiki/index.md`, which may
  declare `okf_version` and nothing else.
- Run `npm run check` before committing. It is a profile lint, stricter than OKF itself, so it
  can reject a bundle that is still valid OKF.

Full field tables, every `okf.*` key, and worked examples: `docs/okf-profile.md`.
<!-- okf-template:profile-min:end -->

## This wiki

Topics live in `topics.json`. Replace this section with your own domain conventions: what each
topic covers, naming rules, and anything a contributor to this subject needs that the profile
above does not say.

## Layout

- `wiki/<topic>/<slug>.md` concept pages; `wiki/<topic>/index.md` optional intro prose.
- `wiki/index.md` the bundle root, declaring `okf_version` and nothing else.
- `raw/<topic>/` immutable source material. Read, never rewrite.
- `site/` generated. `npm run build` only, never by hand.
