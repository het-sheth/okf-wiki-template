# okf-wiki-template v2.0.0: OKF v0.2, merge-safe layout, versioned releases

Date: 2026-08-20
Status: approved design, not yet implemented
Scope: `okf-wiki-template` (primary), `example-second-brain` (backport), `example-agent-rules` (one pointer plus a changelog)

## Problem

Three repositories are meant to work together and currently do not.

1. `okf-wiki-template` targets OKF v0.1. The spec is at v0.2 (released 2026-07-25), which renames
   `timestamp` to `generated.at` and replaces the body `# Citations` heading with a `sources:`
   frontmatter family. The template's `AGENTS.md` still mandates both superseded forms.
2. The template is domain-locked in code. `lib/okf.mjs:3` hardcodes the concept-type vocabulary and
   the profile hardcodes `stub | learning | researched | solid` as the lifecycle, so a wiki about a
   different subject cannot use its own vocabulary without editing engine code.
3. The template has no git tags, no CHANGELOG, no CI, and no CONTRIBUTING, while the two sibling
   repositories are both tagged `v1.0.0`. It is not versioned in any sense.
4. Nothing references the template. `example-agent-rules`' README "Related" section names only
   `example-second-brain`, and that repository's `docs/composing.md` describes only the
   rulebook-plus-second-brain pair. The template is an orphan in its own ecosystem.
5. `example-second-brain` states in prose (`AGENTS.md:46`, `AGENTS.md:73`) that `timestamp:` and
   `# Citations` are gone, but no code enforces it. Content using either form passes `npm run check`.

## Product boundaries

The three repositories are distinguished by audience, not by tooling.

| Repository | Is | Audience | Load pattern |
|---|---|---|---|
| `example-agent-rules` | behavior layer | any machine, any agent | every session, so it stays short |
| `okf-wiki-template` | domain-neutral KB engine | anyone building a wiki about a subject | on demand, per subject |
| `example-second-brain` | one human's context layer | a single person, with journal and capture workflow | on demand, at task start |

A consequence worth stating: the template must not acquire personal-workflow opinions (a dated
journal inbox, daily and weekly note templates, a capture ritual). Those belong to the second-brain
product. The template ships the engine and the profile, and leaves the workflow to the clone.

## Part 1: file ownership and the upgrade channel

Clones track the template as a git remote and merge from it. No npm package is published. The layout
therefore has to make merges small and predictable.

### Ownership classes

Ownership means **who edits a file**, not who reads it. An engine file reading user data is normal
and is not shared ownership.

```
ENGINE   template edits, clone never does
  lib/  build.mjs  scripts/  test/  ingest/  .github/  docs/okf-profile.md  docs/upgrading.md
USER     clone edits, template never does after scaffold
  wiki/  raw/  topics.json  AGENTS.md  README.md
NEGOTIATED  both edit; conflicts here are expected and small
  package.json
```

`package.json` is the one negotiated file. The template owns `scripts`, `dependencies`, and
`engines`; the clone owns `name`, `description`, `version`, and the `okf` block. This is a deliberate
exception rather than an oversight: inventing a separate `wiki.config.json` to achieve pure
separation buys a cleaner diagram at the cost of a second config file, a second loader, and a
migration for existing clones. `docs/upgrading.md` documents `package.json` as the one file where a
merge conflict is normal and how to resolve it (take the template's `scripts` and `dependencies`,
keep your own `name` and `okf`).

### Engine tests stop depending on user content

`test/build-check.test.mjs:55` copies live `wiki/` content into its sandbox and `:94` asserts the
current concept count. That makes an ENGINE test fail whenever a USER edits content, which breaks the
ownership model in practice even though the files are in different directories.

Fix: move all test inputs to `test/fixtures/<case>/`, self-contained bundles owned by the engine. A
clone that deletes the shipped example topic and writes its own must still see `npm test` pass.

### Ingest is an engine tool that writes user content

`ingest/ingest/cli.py:57` writes into `raw/` and `wiki/`. That does not make those directories
engine-owned. Ingest is an ENGINE tool authorized to create USER content, the same way `git` is
allowed to write files it does not own. Documented as such so the classification is not read as a
contradiction.

### AGENTS.md keeps the normative minimum

The original design moved the whole profile out of `AGENTS.md` into `docs/okf-profile.md` behind a
pointer. That is wrong in one specific way: `AGENTS.md` is auto-loaded by every wired agent
(`example-agent-rules/README.md:196`), while a pointer is advisory and can be skipped. Rules that must
apply *before* the first page is written cannot sit behind an advisory hop.

Split by normativity, not by length:

- **`AGENTS.md` (USER-owned) keeps**: required `type`; the prohibited legacy names (`timestamp`,
  `# Citations`) with their replacements; the `sources:` plus footnote rule; the never-invent-content
  rule; and `npm run check`. Target 25 lines or fewer.
- **`docs/okf-profile.md` (ENGINE-owned) gets**: the full field tables, every `okf.*` config key,
  worked frontmatter examples, link and wikilink forms, federation and manifest detail, rationale.

`AGENTS.md` becoming USER-owned is what lets a clone state its own domain conventions freely. The
normative minimum is short enough that restating it after a spec change is a small hand edit, and CI
checks that the pointer target exists.

### Merges require verified ancestry

`git merge template/main` only works between repositories that share history. `voice-ai-wiki` proves
the failure case: it is a conceptual ancestor with a materially different schema (required
`title`/`topic`/`status` rather than OKF `type`, extra `lede`/`desc`/`related`/`confidence`/
`first_seen`/`order` keys, a `log/` directory) and no shared commit. Merging unrelated histories
produces exactly the large conflict event this design exists to avoid.

- At scaffold time the clone records its base in `.okf-template-base` (ENGINE-owned), containing the
  template tag and commit it was created from.
- `npm run upgrade:check` verifies ancestry before any merge is suggested, via
  `git merge-base --is-ancestor <recorded base> template/main`, and refuses with a clear message when
  the repositories are unrelated.
- `docs/upgrading.md` documents two distinct paths: **merge** for verified descendants, and a one-time
  **import guide** for non-descendants. The import guide is prose plus a checklist, not a command.
- `voice-ai-wiki` is explicitly *not* upgradeable through the merge channel. Converting it is
  follow-on work with its own conversion script, out of scope here.

### Cross-repository seams

Three one-line additions so the template stops being an orphan, mirroring the pair that already works:

1. `example-agent-rules/README.md` "Related" section names the template alongside second-brain.
2. `okf-wiki-template/docs/composing.md`, new, the subject-wiki counterpart of second-brain's:
   standing instructions go to the rulebook, personal daily context to second-brain, durable subject
   knowledge to a template clone. Points at `_machine.md`'s Paths section as the wiring.
3. The template `README.md` names both siblings.

## Part 2: the OKF v0.2 profile

### What the tool is

`npm run check` is a **template authoring profile lint**, not a general OKF validator. The spec
requires consumers to tolerate unknown keys and producers may add their own, so a bundle this lint
rejects can still be valid OKF. Two consequences:

- Error text says the key is *prohibited by this profile* and names the replacement. It never says the
  document is invalid OKF.
- Build and export paths preserve and ignore unknown frontmatter keys rather than dropping them, per
  the spec's "consumers SHOULD preserve unknown ones."

### Profile changes

1. **`timestamp:` is prohibited.** `check` fails, naming `generated.at` as the replacement.
2. **`# Citations` is prohibited.** `check` fails, naming the `sources:` family. Each `sources:` entry
   carries an `id`; claims reference sources by footnote marker.
3. **Status vocabulary is configurable** via `okf.statusValues` and `okf.statusDefault`, backported
   from `example-second-brain/lib/config.mjs`.
4. **`okf_version` is permitted only in `wiki/index.md`**, and only as the sole frontmatter key.
   Backported verbatim from `example-second-brain/check.mjs:95-102`. Every other reserved file stays
   frontmatter-free. This resolves a live contradiction: the current `AGENTS.md` forbids frontmatter on
   reserved files while the spec permits `okf_version` on the bundle root.
5. **`stale_after` is validated** as an ISO date and compared against the current UTC date. Staleness
   is **advisory**: reported by `npm run stats`, never a `check` failure. A page does not become
   invalid by sitting still.
6. **Concept types are configurable** via `okf.conceptTypes`. Closing the set is legitimate for an
   authoring gate even though the spec leaves `type` open, but *which* set is closed must be the
   clone's choice. This is the main lever for "a KB about anything": an education wiki uses `lesson`,
   `rubric`, `assessment`.
7. **The computation family** (`runtime`, `parameters`, `computation`, `executor`, `attester`) is out
   of scope, documented so it reads as deliberate rather than missed.

### Resolving the defaults contradiction

"Every `okf.*` key defaults to current behavior" and "`statusValues` defaults to the spec's three"
cannot both hold, because the template's current vocabulary is `stub | learning | researched | solid`.
Split code default from shipped value:

- **Code defaults** reproduce today's behavior exactly, so an existing clone that adds no `okf` block
  sees zero change on merge. `statusValues` defaults to `stub | learning | researched | solid`;
  `conceptTypes` defaults to `concept | pattern | worked-example`.
- **The shipped `package.json`** sets the block explicitly to the spec-aligned vocabulary, so a new
  clone starts on `draft | stable | deprecated`.

Both properties hold at once, and neither is achieved by silent magic.

### Validation is mechanical only

A checker cannot identify a semantic claim, so it must not pretend to. `check` enforces only:

- `generated.at`, `verified[].at`, and `stale_after` parse as ISO 8601, `stale_after` as a date.
- `generated` has `by` and `at`; `verified` is a list of `{by, at}`.
- `sources:` entries have unique `id` values within the page, plus `resource` and `title`.
- Every footnote marker used in the body resolves to a declared source `id`, and no declared `id` is
  orphaned.

"Every factual claim carries a marker" is stated in `AGENTS.md` as a review rule for humans and
agents. It is not machine-checked, and the spec is explicit that it is not.

### Archival is decoupled from the status vocabulary

`example-second-brain/lib/config.mjs:49` derives `archivalEnabled` from whether the configured
vocabulary happens to contain `deprecated`, so a custom vocabulary silently disables all
`superseded_by` validation and a page can carry a dangling or cyclic pointer unchecked. Lifecycle
policy and reference integrity are separate concerns.

- `okf.archival` becomes an explicit boolean.
- `superseded_by` is validated for target existence and cycles **whenever the key is present**,
  regardless of vocabulary or flag. A pointer that goes nowhere is a broken link, and broken links are
  already this profile's business.

### `npm run migrate` does not fabricate provenance

`generated.by` records who produced a page. A v0.1 page has a `timestamp` and no author, so any value
the script writes there is invented. `human:unknown` in a provenance field is a false claim dressed as
a record.

Default behavior, no flags:

- `# Citations` lists convert to `sources:` entries with ids derived from the cited URL or title. This
  is mechanical and safe.
- `timestamp:` is **reported, not rewritten**. The script prints each file and stops touching it.
- Anything not mechanically convertible is reported with its file and line.

With `--generated-by <actor>`:

- `timestamp: X` becomes `generated: {by: <actor>, at: X}`, because the operator has now supplied the
  missing fact.

Alternative for bulk cases, documented: `--legacy-timestamp` moves the value to a `legacy_timestamp`
extension key, which makes no provenance claim and passes the lint as an unknown key.

The script is idempotent: a second run over migrated content changes nothing and exits zero.

### Ingest is updated first

`ingest/ingest/draft.py:25-33` emits `status: stub`, `timestamp:`, and a `# Citations` section, all
prohibited under the new profile. Verified by inspection. If enforcement lands first, `npm run ingest`
generates content that `npm run check` rejects on the same run.

Ordering constraint for implementation: **update `draft.py` before enabling the new checks.** The
emitted stub becomes `generated: {by: "tool:ingest", at: <clock>}` (honest: the tool did generate it),
`status:` set to the configured default, and `sources:` with one entry for the ingested raw file.

## Part 3: versioning and release discipline

None of the three repositories has a CHANGELOG, and neither CONTRIBUTING mentions versions, releases,
or breaking changes. This defines it once.

### SemVer is defined against the scaffold contract

"The merge needs manual work" is not a stable release property: it depends on what each downstream
edited, so the same release is breaking for one clone and clean for another. Version against the
contract the template publishes at a tag instead:

The **scaffold contract** is: the set of documents `check` accepts, the file layout, the `okf`
configuration schema, and whether a migration step is required.

| Bump | Means |
|---|---|
| MAJOR | the accepted-document set shrinks, the layout changes, the config schema changes incompatibly, or a migration is required |
| MINOR | a new optional `okf.*` key, a new script, or a check that only fires on syntax not previously accepted |
| PATCH | bug fix; the contract is unchanged |

Merge conflicts are a property of a downstream's edits, not of a release, and are addressed by
`docs/upgrading.md` rather than by the version number.

### Two version numbers, not conflated, not coupled

`okf_version` (the spec: `0.2`) and the template's own version (`2.0.0`) move independently. Note that
`example-second-brain` already separates these in practice: `package.json:3` reads `0.1.0` while the
repository is tagged `v1.0.0`. That inconsistency gets fixed as part of its release.

The OKF compatibility matrix lives in the **template's** CHANGELOG and README only. Each repository
records its own version and the OKF versions it supports. No repository's changelog entry is required
to mention another's version, because that couples products that release independently.

### Releases

| Repository | Release | Contents |
|---|---|---|
| `okf-wiki-template` | `v2.0.0` | first tag ever: v0.2 profile, `okf` config block, migrate, CI, CONTRIBUTING, CHANGELOG |
| `example-second-brain` | `v1.1.0` | the three backported enforcements, `okf.archival`, `package.json` version corrected to match its tag |
| `example-agent-rules` | unchanged | README "Related" line plus a CHANGELOG documenting the existing `v1.0.0` |

Second-brain's release is MINOR under the definition above: its content is already clean, so the
accepted-document set shrinks only for syntax it never contained.

### One profile, two implementations, kept honest by a shared corpus

Both repositories keep their own self-contained checker, which means the same profile is implemented
twice and can drift. It already has: both hardcode the concept-type list at `lib/okf.mjs:3` and the
files now differ. No package extraction was chosen, so the drift is detected rather than prevented:

`test/conformance/` holds a small corpus of v0.2 bundles, each valid or invalid with an expected
reason. The directory is byte-identical in both repositories and each runs its own checker against it.
Divergence in profile semantics fails a test in whichever repository drifted. This tests contract
equivalence without a shared dependency.

### CI for the template

Modeled on `example-agent-rules/.github/workflows/lint.yml`, the only existing CI in the three.

1. **Real clone install**: `git clone` into a temporary directory, `npm ci`, then `check` and `test`.
   The existing sandbox approach copies files and symlinks the host `node_modules`
   (`test/build-check.test.mjs:53`), which does not exercise installation at all.
2. **Migration idempotence**: run `migrate` twice over a v0.1 fixture, assert the second run is a
   no-op and that no provenance was invented without `--generated-by`.
3. **Downstream upgrade simulation**: a fixture clone with committed content edits merges a template
   change, then `check` must pass. This is what the clean-clone test cannot prove, since a fresh clone
   has no user content and no merge.
4. **Pointer targets exist**: `docs/okf-profile.md` and every other pointed-at file.
5. **Hygiene**: `site/` is untracked.

Scope note: the clean-clone check proves only that the shipped starter passes. Items 2 and 3 are what
cover upgrades, and the distinction is documented so the suite is not read as stronger than it is.

## Out of scope

- Publishing the validator to npm. Decided against; the update channel is a git remote.
- OKF v0.2's computation family.
- Nested topic paths (`wiki/<topic>/<sub>/<slug>.md`).
- Converting `voice-ai-wiki`. Different schema, no shared history, needs its own conversion script and
  an import guide. Named as follow-on work.
- Generalizing profiles per audience (the `example-agent-rules` v2 roadmap idea). Not needed here.

## Implementation order

The dependencies between steps are real, and one of them is a correctness constraint rather than a
preference.

1. Move test inputs to `test/fixtures/`, so engine tests stop breaking on user content edits.
2. Backport `lib/config.mjs` with `conceptTypes`, `statusValues`, `statusDefault`, `reservedFiles`,
   `allowCrossWikiLinks`, `archival`. Code defaults reproduce today's behavior.
3. Update `ingest/ingest/draft.py` to emit v0.2 frontmatter. **Before** step 4.
4. Add the prohibitions and the mechanical validations to `check`, with profile-scoped error wording.
5. Add `okf_version` handling for `wiki/index.md`, and create that file.
6. Write `npm run migrate` and `npm run upgrade:check`, plus `.okf-template-base`.
7. Split `AGENTS.md` into the normative minimum plus `docs/okf-profile.md`; write `docs/upgrading.md`
   and `docs/composing.md`.
8. Add `test/conformance/`, CI, CONTRIBUTING, CHANGELOG; tag `v2.0.0`.
9. Backport steps 2, 4, 5 and the conformance corpus to `example-second-brain`; tag `v1.1.0`.
10. Add the cross-repository seam lines and `example-agent-rules`' CHANGELOG.
