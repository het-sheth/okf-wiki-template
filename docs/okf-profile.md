# OKF v0.2 authoring profile

`npm run check` is this template's authoring-profile lint, not a general OKF validator. It closes
some choices that OKF permits, so a bundle rejected here can still be valid OKF. The lint applies
the profile's legacy-form prohibitions only to wiki concept pages. `raw/` is immutable source
material and is not rewritten or subject to those prohibitions.

Markdown in `wiki/` is canonical. `npm run build` generates `site/`. A build with validation
problems exits non-zero and, if a prior `site/` exists, removes that stale generated directory so
it cannot look current.

## Frontmatter fields

Only `type` is required on a wiki concept page. Other fields below are optional unless their own
shape rules say otherwise. Unknown frontmatter is retained rather than rejected.

| Field | Requirement and shape | Example |
|---|---|---|
| `type` | Required. A string in `okf.conceptTypes`. | `type: concept` |
| `title` | Optional display title. | `title: How to publish` |
| `description` | Optional summary used on cards. | `description: Steps for publishing a wiki.` |
| `tags` | Optional tag list used on cards. | `tags: [authoring, publishing]` |
| `resource` | Optional resource URI for a page. | `resource: https://example.com/guide` |
| `status` | Optional. When present, it must be a member of `okf.statusValues`. An absent value is allowed. | `status: stable` |
| `generated` | Optional mapping with a non-empty `by` and ISO 8601 `at`. | `generated: { by: human:ava, at: 2026-08-24T12:00:00Z }` |
| `verified` | Optional list of mappings, each with non-empty `by` and ISO 8601 `at`. | `verified: [{ by: human:lee, at: 2026-08-24T12:00:00Z }]` |
| `stale_after` | Optional ISO date in `YYYY-MM-DD` form. A past date is advisory, not a check failure. | `stale_after: 2027-01-01` |
| `sources` | Optional list. Each entry needs unique `id`, `resource`, and `title`, and every id must be used by a body footnote marker. | `sources: [{ id: spec, resource: https://example.com/spec, title: Spec }]` |
| `superseded_by` | Optional `topic/slug` string naming an existing concept. It must not form a cycle. | `superseded_by: guides/publishing-v2` |
| `legacy_timestamp` | Optional historical value retained by migration. It makes no provenance claim and has no profile shape check. | `legacy_timestamp: 2026-06-27T00:00:00Z` |

`timestamp` is not in the table because it is prohibited by this profile. Use `generated.at` for
provenance, or retain an unknown historical value as `legacy_timestamp` when no provenance can be
honestly supplied.

## Vocabularies and configuration

The examples use this template's shipped configuration. A clone can choose a vocabulary suitable
for its subject, so words in examples are not universal. `type` values come from
`okf.conceptTypes`; `status` values come from `okf.statusValues`.

| Key | Default when omitted | Purpose and effect |
|---|---|---|
| `okf.conceptTypes` | `concept`, `pattern`, `worked-example` | Defines the allowed values for required concept `type`. |
| `okf.statusValues` | `stub`, `learning`, `researched`, `solid` | Defines the allowed values for a present `status`. The shipped template explicitly uses `draft`, `stable`, `deprecated`. |
| `okf.statusDefault` | `stable` when that value is in `okf.statusValues`, otherwise `null` | Resolves the configured default for an absent `status`, or `null` to disable it. The profile lint permits an absent status and does not apply this value while checking. |
| `okf.needsWorkStatus` | `stub` when that value is in `okf.statusValues`, otherwise the first vocabulary member | Chooses which explicit status receives the muted card treatment. It is separate from `okf.statusDefault`: one describes an absent status, while the other identifies work that needs attention. Set it to `null` to disable the treatment. |
| `okf.reservedFiles` | `index.md`, `log.md` | Configuration accepted and returned by the resolver for the reserved-file vocabulary. The current generator's reserved-file checks are fixed to these two names. |
| `okf.archival` | `false` | Declares archival lifecycle policy. It does not turn `superseded_by` validation on or off. |
| `okf.federation` | `false` | Enables resolution of cross-wiki links against discovered peer manifests. With it off, cross-wiki links are masked in output and not resolved. |
| `okf.title` | `null` | Optional title used as the `title` field in `site/manifest.json`; the package name is used when it is absent. |

## Prohibited forms

`timestamp` is prohibited by this profile. Replace it with `generated: { by, at }` when the
provenance is known. A `# Citations` heading is prohibited by this profile. Replace it with
frontmatter `sources:` entries and body footnote markers. These forms were renamed in OKF v0.2.

The wording is deliberate: this lint may reject a bundle that OKF still accepts. It reports that a
key or form is prohibited by this profile, not that the bundle is invalid OKF.

## Sources and footnotes

Declare every source in frontmatter, then put `[^id]` markers beside the claims they support. A
declared id must have a marker, and every marker must name a declared id. A definition line such as
`[^spec]: text` does not count as a marker use.

```markdown title="Two cited claims"
---
type: concept
title: Cited example
sources:
  - id: spec
    resource: https://example.com/spec
    title: Product specification
  - id: study
    resource: https://example.com/study
    title: Field study
---

The protocol has three phases.[^spec]
The field study measured a lower error rate.[^study]

[^spec]: Product specification
[^study]: Field study
```

## Supersession

`superseded_by` is checked whenever it appears, regardless of `okf.archival`. It must point to an
existing `topic/slug`, cannot point to itself, and cannot participate in a cycle of any length.
Archival policy and reference integrity are separate concerns.

## Links and rendering conventions

Link concept pages with standard Markdown links, preferably an absolute repo-root link such as
`[Publishing](/wiki/guides/publishing.md)`, or a relative link such as
`[Publishing](./publishing.md)`. Each local Markdown target must be an existing wiki concept.
Refer to `raw/` source material as inline code or through `resource`, not as a clickable concept
link.

Within a wiki, use `[[slug]]`, `[[topic/slug]]`, or `[[slug|Label]]`. A bare slug resolves within
the current topic. Every within-wiki wikilink must resolve to a concept.

Cross-wiki wikilinks use `[[peer:topic/slug]]` or `[[peer:topic/slug|Label]]`. Both the peer name
and the full `topic/slug` are required. With `okf.federation: false`, they render only their label,
or `(linked page)`, and are not resolved. With `okf.federation: true`, the generator uses a
discoverable `peers.json` from `OKF_PEERS` or sibling `../knowledge-hub/peers.json` to resolve a
peer manifest when available.

The generator also recognizes `> [!TIP]`, `[!NOTE]`, `[!WARNING]`, `[!CAUTION]`, and
`[!IMPORTANT]` callouts. A fenced block with an info string like
````text
```js title="Example"
```
````
gets a code-block head bar. Tables, lists, and headings use ordinary Markdown.

## Staleness

`stale_after` is a maintenance signal. A valid date in the past is advisory and does not fail
`npm run check`; malformed values do fail it.

The profile validates the shape available after YAML parsing, not calendar validity in the original
text. `gray-matter`'s YAML engine can silently coerce an out-of-range unquoted date such as
`2027-13-99` into a valid `Date`, losing the original scalar. Without controlling the YAML schema,
and without adding a YAML dependency, range validation is impossible. Consequently, a date YAML can
coerce will pass the check, and staleness can fire on a day the author did not choose.

## Reserved content and federation manifest

`index.md` and `log.md` are reserved and normally have no frontmatter. The exception is
`wiki/index.md`, which may declare only `okf_version`. The reserved directories
`wiki/_templates/` and `wiki/journal/` are exempt from the type requirement, link and wikilink
resolution, and the no-frontmatter rule. They are not published to `site/`; templates may contain
example frontmatter, while the journal is a freeform private inbox.

Every successful `npm run build` writes deterministic `site/manifest.json` for federation. It has
`wiki`, `title`, and `pages`. Each page has `id` (`topic/slug`), `title`, `topic`, `type`,
`description`, `tags`, `href` relative to this wiki's `site/`, and `links`, its outgoing
`[[peer:topic/slug]]` references. A hub can use `links` to build backlinks.

## Styling a custom status

The muted card's emitted CSS class is always `needs-work`, not the status word. Change
`okf.needsWorkStatus` to select another configured status without changing `assets/wiki.css`.

## Operations

- `npm run check` is the everyday profile-lint gate and writes nothing.
- `npm test` runs the Node test suite.
- `npm run build` validates first, then regenerates `site/` and its manifest. If validation fails,
  it exits non-zero and removes an existing stale `site/`.
- If the optional ingest pipeline is present, run `npm run ingest -- <src> --topic <topic>`.
