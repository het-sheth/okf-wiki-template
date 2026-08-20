# okf-wiki-template v2.0.0: OKF v0.2, a real upgrade tool, versioned releases

Date: 2026-08-20
Revision: 3 (revisions 1 and 2 were withdrawn after adversarial review; see "Rejected approaches")
Status: approved design, not yet implemented
Scope: `okf-wiki-template` (primary), `example-second-brain` (backport), `example-agent-rules` (one pointer plus a changelog)

## Problem

Three repositories are meant to work together and currently do not.

1. `okf-wiki-template` targets OKF v0.1. The spec is at v0.2 (released 2026-07-25), which renames
   `timestamp` to `generated.at` and replaces the body `# Citations` heading with a `sources:`
   frontmatter family. The template's `AGENTS.md` still mandates both superseded forms, and its own
   shipped example content uses them (`wiki/getting-started/welcome.md:6`).
2. The template is domain-locked in code. `lib/okf.mjs:3` hardcodes the concept-type vocabulary, the
   profile hardcodes `stub | learning | researched | solid` as the lifecycle, and `build.mjs:311`
   hardcodes a card class keyed to `stub`. A wiki about another subject cannot use its own vocabulary
   without editing engine code.
3. The template has no git tags, no CHANGELOG, no CI, and no CONTRIBUTING, while both sibling
   repositories are tagged `v1.0.0`. It is not versioned in any sense.
4. Nothing references the template. `example-agent-rules`' README "Related" section names only
   `example-second-brain`, and that repository's `docs/composing.md` describes only the
   rulebook-plus-second-brain pair. The template is an orphan in its own ecosystem.
5. `example-second-brain` states in prose (`AGENTS.md:46`, `AGENTS.md:73`) that `timestamp:` and
   `# Citations` are gone, but no code enforces it. Content using either form passes `npm run check`.
6. A clone has no way to receive a template fix at all. There is no upgrade path, documented or
   otherwise.

## Product boundaries

The three repositories are distinguished by audience, not by tooling.

| Repository | Is | Audience | Load pattern |
|---|---|---|---|
| `example-agent-rules` | behavior layer | any machine, any agent | every session, so it stays short |
| `okf-wiki-template` | domain-neutral KB engine | anyone building a wiki about a subject | on demand, per subject |
| `example-second-brain` | one human's context layer | a single person, with journal and capture workflow | on demand, at task start |

A consequence worth stating: the template must not acquire personal-workflow opinions (a dated journal
inbox, daily and weekly note templates, a capture ritual). Those belong to the second-brain product.
The template ships the engine and the profile, and leaves the workflow to the clone.

## Part 1: upgrades are a tool, not a git operation

### Why not git merge

Revision 2 proposed `git remote add template` plus `git merge template/main`, gated by an ancestry
preflight. That cannot work for this template's actual onboarding path. `README.md:8` instructs users
to click GitHub's "Use this template", which creates a repository with **unrelated history and a
single initial commit**, unlike a fork. No recorded template commit is ever an ancestor, so the
preflight would correctly refuse every clone created the documented way.

Onboarding stays one click. Upgrading becomes an explicit tool.

### `npm run upgrade`

A script that fetches a pinned template release and applies engine files over the clone. It is a file
sync with a manifest, not a merge, so it never depends on shared history.

Behavior:

1. Read `.okf-template-version` (the release the clone last synced from; created at scaffold time).
2. Fetch the requested template release (default: latest) as a tarball, verified by its published
   SHA-256.
3. Replace every ENGINE file wholesale. These files have one owner, so replacement is always correct.
4. Patch the engine-owned **fields** of `package.json` (`scripts`, `dependencies`, `engines`) with a
   JSON-aware edit that leaves `name`, `description`, `version`, and `okf` untouched.
5. Regenerate `package-lock.json` by running `npm install`. The lockfile is derived, never merged.
6. Apply the `okf` config transition described below.
7. Update the NEGOTIATED block in `AGENTS.md` between its markers.
8. Print a report: every file replaced, every field patched, and everything it declined to touch.
9. Write the new version into `.okf-template-version`.

The tool is idempotent: running it twice against the same release changes nothing on the second run.

### File ownership defines what the tool may overwrite

Ownership means who may write a file, which is now directly actionable: it is the sync manifest.

```
ENGINE   the tool replaces wholesale
  lib/  build.mjs  scripts/  test/  ingest/  .github/
  docs/okf-profile.md  docs/upgrading.md  docs/composing.md
  package-lock.json (derived; regenerated, not copied)
  .okf-template-version (tool state)
USER     the tool never touches
  wiki/  raw/  topics.json  README.md
NEGOTIATED  the tool patches a bounded region only
  package.json      engine fields patched; name/description/version/okf preserved
  AGENTS.md         the marked normative block replaced; all other prose preserved
```

`package-lock.json` is classified ENGINE and derived. Revision 2 called `package.json` "the only
negotiated file" while the lockfile duplicates `name`, `version`, and `dependencies`
(`package-lock.json:1-11`), which made that claim false. A clone that legitimately needs its own
dependency adds it to `package.json`; step 5 regenerates the lockfile to include it.

### Engine tests stop depending on user content

`test/build-check.test.mjs:55` copies live `wiki/` content into a sandbox and `:99` asserts the current
two-concept count. An ENGINE file therefore fails whenever a USER edits content. Since the tool
replaces engine tests wholesale on every upgrade, this would break every clone that has written its
own pages.

Fix: move all test inputs to `test/fixtures/<case>/`, self-contained bundles owned by the engine. A
clone that deletes the shipped example topic and writes its own must still see `npm test` pass.

### Ingest is an engine tool that writes user content

`ingest/ingest/cli.py:48` writes the raw page and `:68` writes the wiki page. That does not make those
directories engine-owned. Ingest is an ENGINE tool authorized to create USER content, the way `git` may
write files it does not own. Stated explicitly so the classification does not read as a contradiction.

### AGENTS.md carries a NEGOTIATED normative block

`AGENTS.md` is auto-loaded by every wired agent (`example-agent-rules/README.md:198`), while a pointer
is advisory and can be skipped. Rules that must apply before the first page is written cannot sit behind
an advisory hop. But if the file is purely USER-owned, the template can never amend those rules, and a
spec change never reaches any clone.

Resolution: bound the normative rules in markers and let the tool own that region only.

```markdown
<!-- okf-template:profile-min:begin -->
... required `type`; prohibited legacy names and their replacements; the sources plus
    footnote rule; the never-invent-content rule; `npm run check` ...
<!-- okf-template:profile-min:end -->
```

- Inside the markers: template-owned, replaced by `npm run upgrade`, budgeted at 25 lines.
- Outside the markers: clone-owned, never touched. Domain conventions, topic list, local rules.
- CI verifies the block's exact content against the canonical copy and enforces the line budget, the
  same way `example-agent-rules` CI enforces its 100-line budget on the assembled `AGENTS.md`.
- Detail, examples, and rationale live in `docs/okf-profile.md` (ENGINE), reached by a pointer line
  inside the block.

### Cross-repository seams

Three one-line additions so the template stops being an orphan, mirroring the pair that already works:

1. `example-agent-rules/README.md` "Related" section names the template alongside second-brain.
2. `okf-wiki-template/docs/composing.md`, new, the subject-wiki counterpart of second-brain's:
   standing instructions go to the rulebook, personal daily context to second-brain, durable subject
   knowledge to a template clone. Points at `_machine.md`'s Paths section as the wiring.
3. The template `README.md` names both siblings.

### voice-ai-wiki

`voice-ai-wiki` runs a different schema: required `title`/`topic`/`status` rather than OKF `type`, plus
`lede`/`desc`/`related`/`confidence`/`first_seen`/`order` and a `log/` directory
(`voice-ai-wiki/AGENTS.md:16-33`). The upgrade tool is not a conversion tool and will not rescue it.
Converting it is follow-on work with its own script and its own guide. Out of scope here.

## Part 2: the OKF v0.2 profile

### What the tool is

`npm run check` is a **template authoring profile lint**, not a general OKF validator. The spec requires
consumers to tolerate unknown keys and permits producers to add their own, so a bundle this lint rejects
can still be valid OKF. Two consequences:

- Error text says the key is *prohibited by this profile* and names the replacement. It never says the
  document is invalid OKF.
- Build and export paths preserve and ignore unknown frontmatter keys rather than dropping them, per the
  spec's "consumers SHOULD preserve unknown ones."

### Profile changes

1. **`timestamp:` is prohibited.** `check` fails, naming `generated.at` as the replacement.
2. **`# Citations` is prohibited.** `check` fails, naming the `sources:` family. Each `sources:` entry
   carries an `id`; claims reference sources by footnote marker.
3. **Status vocabulary is configurable** via `okf.statusValues` and `okf.statusDefault`, backported from
   `example-second-brain/lib/config.mjs`.
4. **`okf_version` is permitted only in `wiki/index.md`**, and only as the sole frontmatter key.
   Backported from `example-second-brain/check.mjs:95`. Every other reserved file stays
   frontmatter-free. This resolves a live contradiction: the current `AGENTS.md` forbids frontmatter on
   reserved files while the spec permits `okf_version` on the bundle root.
5. **`stale_after` is accepted**, with severity split normatively: a malformed date is a `check`
   failure; a valid date in the past is a `stats` warning and never a `check` failure. A page does not
   become invalid by sitting still. Tests inject the clock rather than reading the real one.
6. **Concept types are configurable** via `okf.conceptTypes`. Closing the set is legitimate for an
   authoring gate even though the spec leaves `type` open, but which set is closed must be the clone's
   choice. This is the main lever for "a KB about anything": an education wiki uses `lesson`, `rubric`,
   `assessment`.
7. **The computation family** (`runtime`, `parameters`, `computation`, `executor`, `attester`) is out of
   scope, documented so it reads as deliberate rather than missed.
8. **`build.mjs:311`'s hardcoded `stub` card class becomes config-driven**, keyed off
   `okf.statusDefault` and the configured vocabulary. Otherwise a clone with a custom lifecycle renders
   a class that can never match.

### The config transition is explicit, not silent

Revision 2 claimed an existing clone adding no `okf` block would see zero change. That was wrong.
`package.json` currently has no `okf` key at all, so a template-side addition lands as a clean
three-way merge and the clone silently inherits whatever vocabulary the template shipped. The shipped
example proves the damage: `wiki/getting-started/welcome.md:7` carries `status: solid`, which is not in
the spec vocabulary.

There is no silent path. `npm run upgrade` handles the transition in the open:

- Clone has **no** `okf` block: the tool writes the **legacy** block explicitly
  (`stub | learning | researched | solid`, `concept | pattern | worked-example`), preserving current
  behavior, and prints how to opt into the spec vocabulary with `npm run migrate --status-map`.
- Clone **has** an `okf` block: the tool leaves it alone entirely.
- A **new** clone gets a shipped `package.json` whose `okf` block is the spec-aligned vocabulary.

Code defaults still reproduce today's behavior for a clone that never runs the tool, so nothing breaks
by inaction. The difference from revision 2 is that adoption is now an action someone takes, not a
side effect of a merge.

### Validation is mechanical only

A checker cannot identify a semantic claim, so it must not pretend to. `check` enforces only:

- `generated.at`, `verified[].at`, and `stale_after` parse as ISO 8601, `stale_after` as a date.
- `generated` has `by` and `at`; `verified` is a list of `{by, at}`.
- `sources:` entries have unique `id` values within the page, plus `resource` and `title`.
- Every footnote marker used in the body resolves to a declared source `id`, and no declared `id` is
  orphaned.

"Every factual claim carries a marker" is stated in the `AGENTS.md` normative block as a review rule for
humans and agents. It is not machine-checked.

### Archival is decoupled from the status vocabulary

`example-second-brain/lib/config.mjs:49` derives `archivalEnabled` from whether the configured
vocabulary happens to contain `deprecated`, so a custom vocabulary silently disables all `superseded_by`
validation and a page can carry a dangling or cyclic pointer unchecked. Lifecycle policy and reference
integrity are separate concerns.

- `okf.archival` becomes an explicit boolean.
- `superseded_by` is validated for target existence and cycles whenever the key is present, regardless
  of vocabulary or flag. A pointer that goes nowhere is a broken link, and broken links are already this
  profile's business.

### `npm run migrate` reaches a passing state without inventing provenance

Two constraints in tension: `generated.by` records who produced a page, and a v0.1 page has a timestamp
but no author, so any value written there is invented. But a migration that leaves content failing
`check` is not a migration.

Both are satisfied by not treating `legacy_timestamp` as provenance.

Default behavior, no flags, ends in a state where `check` passes:

- `# Citations` lists convert to `sources:` entries with ids derived from the cited URL or title.
- `timestamp: X` moves to `legacy_timestamp: X`, an extension key that makes no provenance claim and
  passes the lint as an unknown key. Nothing is fabricated and nothing is left failing.
- Status values map through the built-in table: `stub -> draft`, `learning -> draft`,
  `researched -> stable`, `solid -> stable`. Any value not in the table is reported and left alone.
- Anything not mechanically convertible is reported with file and line.

Flags:

- `--generated-by <actor>`: `timestamp: X` becomes `generated: {by: <actor>, at: X}`, because the
  operator has supplied the missing fact.
- `--status-map <old>=<new>,...`: override or extend the built-in status table.

The script is idempotent: a second run over migrated content changes nothing and exits zero.

### Ingest is updated first

`ingest/ingest/draft.py:30` emits `status: stub` and `timestamp:`, and `:36` emits a `# Citations`
section. All three are prohibited under the new profile. Verified by inspection. If enforcement lands
first, `npm run ingest` generates content that `npm run check` rejects on the same run.

Ordering constraint: **update `draft.py` before enabling the new checks.** The emitted stub becomes
`generated: {by: "tool:ingest", at: <clock>}` (honest, since the tool did generate it) and `sources:`
with one entry for the ingested raw file.

Ingest also needs a status it can legitimately emit. `config.mjs:28` resolves an omitted
`statusDefault` to `null` when the vocabulary lacks `stable`, and the legacy vocabulary lacks it. So:
**ingest requires a resolvable non-null status**, and fails with a clear message naming
`okf.statusDefault` when the configuration does not provide one.

### The shipped example topic is migrated as part of the release

`wiki/getting-started/welcome.md:6-7` and `writing-concepts.md:6` use the prohibited forms and the old
vocabulary. They are the first thing a new clone reads. They are migrated in the same release, and
their migrated form is a fixture in the migration tests.

### docs/okf-profile.md is configuration-parametric

The profile document is ENGINE-owned but a clone may configure vocabularies the document cannot know.
Every vocabulary-dependent passage states that it illustrates the **default** configuration and names
the `okf.*` key that changes it. Nothing in it presents `concept` or `draft` as universally normative.

## Part 3: versioning and release discipline

None of the three repositories has a CHANGELOG, and neither CONTRIBUTING mentions versions, releases,
or breaking changes. This defines it once.

### SemVer is defined against the scaffold contract

"The merge needs manual work" is not a stable release property: it depends on what each downstream
edited. Version against the contract the template publishes at a tag instead.

The **scaffold contract** is: the set of documents `check` accepts, the ENGINE file manifest, the `okf`
configuration schema, and whether a migration step is required.

| Bump | Means |
|---|---|
| MAJOR | the accepted-document set shrinks, the ENGINE manifest changes incompatibly, the config schema changes incompatibly, or a migration is required |
| MINOR | a new optional `okf.*` key, a new script, or a check that only fires on syntax not previously accepted |
| PATCH | bug fix; the contract is unchanged |

`v2.0.0` is MAJOR under this definition on two counts: the accepted-document set shrinks, and a
migration is required.

### Two version numbers, not conflated, not coupled

`okf_version` (the spec: `0.2`) and the template's own version (`2.0.0`) move independently.
`example-second-brain` already separates them in practice: `package.json:3` reads `0.1.0` while the
repository is tagged `v1.0.0`. That inconsistency is fixed as part of its release.

The OKF compatibility matrix lives in the template's CHANGELOG and README only. Each repository records
its own version and the OKF versions it supports. No repository's changelog is required to mention
another's version, because that couples products that release independently.

### Releases

| Repository | Release | Contents |
|---|---|---|
| `okf-wiki-template` | `v2.0.0` | first tag ever: v0.2 profile, `okf` config, `migrate`, `upgrade`, CI, CONTRIBUTING, CHANGELOG |
| `example-second-brain` | `v1.1.0` | backported enforcements, `okf.archival`, `package.json` version corrected to match its tag |
| `example-agent-rules` | unchanged | README "Related" line plus a CHANGELOG documenting the existing `v1.0.0` |

Second-brain's release is MINOR: its content is already clean, so the accepted-document set shrinks only
for syntax it never contained.

### Profile drift between the two checkers is accepted for now

Both repositories keep a self-contained checker, so the same profile is implemented twice and can drift.
It already has: both hardcode the concept-type list at `lib/okf.mjs:3` and the files now differ.

Revision 2 proposed a byte-identical `test/conformance/` corpus in both repositories. That is cut. There
was no mechanism to keep two copies identical, so editing one could hide drift rather than reveal it,
and a duplicated fixture set with no enforcement is the item most likely to be abandoned unused.

Drift is accepted and revisited when it actually causes a problem. If it does, the fix is a pinned,
SHA-verified shared artifact, not two hand-synced directories.

### CI for the template

Modeled on `example-agent-rules/.github/workflows/lint.yml`, the only existing CI in the three.

1. **Real clone install**: `git clone` into a temporary directory, `npm ci`, then `check` and `test`.
   The existing sandbox copies files and symlinks host `node_modules` (`test/build-check.test.mjs:58`),
   which does not exercise installation at all.
2. **Migration idempotence**: run `migrate` twice over a v0.1 fixture, assert the second run is a no-op,
   that the result passes `check`, and that no `generated.by` was invented without `--generated-by`.
3. **Upgrade simulation**: scaffold a clone, edit its content and `AGENTS.md` prose, run `upgrade`
   against a newer template build, then assert `check` passes, the user's prose survived, and the
   normative block was replaced.
4. **Normative block integrity**: the `AGENTS.md` marked region matches the canonical copy and is within
   its line budget.
5. **Pointer targets exist**, and `site/` is untracked.

Item 1 proves only that the shipped starter passes. Items 2 and 3 are what cover upgrades, and the
distinction is documented so the suite is not read as stronger than it is.

## Rejected approaches

- **npm package for the validator.** Rejected: the template stays self-contained.
- **`git merge template/main` with an ancestry preflight** (revision 2). Rejected: GitHub's "Use this
  template" produces unrelated histories, so the preflight refuses every clone created the documented
  way.
- **Silent config defaults on merge** (revision 2). Rejected: `package.json` has no `okf` key today, so
  the block merges cleanly and silently changes a clone's vocabulary, invalidating content that
  previously passed.
- **Fully USER-owned `AGENTS.md`** (revision 2). Rejected: the template could then never amend rules
  that must load before the first page is written.
- **Byte-identical duplicated conformance corpus** (revision 2). Rejected: no enforcement mechanism.

## Out of scope

- OKF v0.2's computation family.
- Nested topic paths (`wiki/<topic>/<sub>/<slug>.md`).
- Converting `voice-ai-wiki`. Different schema; needs its own conversion script and guide.
- Generalizing profiles per audience (the `example-agent-rules` v2 roadmap idea).

## Implementation order

1. Move test inputs to `test/fixtures/`, so engine tests stop depending on user content.
2. Backport `lib/config.mjs` with `conceptTypes`, `statusValues`, `statusDefault`, `reservedFiles`,
   `allowCrossWikiLinks`, `archival`. Code defaults reproduce today's behavior.
3. Make `build.mjs:311`'s status card class config-driven.
4. Update `ingest/ingest/draft.py` to emit v0.2 frontmatter, and make ingest require a resolvable
   non-null status. **Before** step 5.
5. Add the prohibitions and mechanical validations to `check`, with profile-scoped error wording.
6. Add `okf_version` handling for `wiki/index.md`, and create that file.
7. Write `npm run migrate` (status table, `legacy_timestamp` default, `--generated-by`,
   `--status-map`), and migrate the shipped `wiki/getting-started/` topic.
8. Write `npm run upgrade` and `.okf-template-version`, including the config transition and the
   `AGENTS.md` marked-block replacement.
9. Restructure `AGENTS.md` around the markers; write `docs/okf-profile.md`, `docs/upgrading.md`,
   `docs/composing.md`.
10. Add CI, CONTRIBUTING, CHANGELOG; tag `v2.0.0`.
11. Backport steps 2, 5, 6 to `example-second-brain`; fix its `package.json` version; tag `v1.1.0`.
12. Add the cross-repository seam lines and `example-agent-rules`' CHANGELOG.
