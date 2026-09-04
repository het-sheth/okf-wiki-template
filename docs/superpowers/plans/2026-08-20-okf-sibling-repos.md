# Sibling Repos Implementation Plan (second-brain backport and cross-repo seams)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the enforcement gap in `example-second-brain` (it documents the v0.2 renames but no code checks them), and wire the three repositories to reference each other so the template stops being an orphan.

**Architecture:** `example-second-brain` already has `lib/config.mjs` and `okf_version` handling, so the backport is narrow: the two prohibitions, configurable concept types, and decoupling archival from the status vocabulary. The cross-repo work is three one-line pointers plus a changelog.

**Tech Stack:** Node 20+, ESM, `node --test`, `gray-matter`. `example-agent-rules` is shell plus GitHub Actions.

**Spec:** `okf-wiki-template/docs/superpowers/specs/2026-08-20-okf-v02-template-design.md` (steps 11 and 12 of its implementation order)

## Global Constraints

- **Run this plan only after `okf-wiki-template` v2.0.0 is tagged.** Task 1 copies validators from it.
- Repository paths: `~/personal/example-second-brain`, `~/personal/example-agent-rules`.
- `example-second-brain` is check-only. It has no `build.mjs` and no `site/`; its entry point is `check.mjs`. Do not add a build step.
- Its `lib/config.mjs` already resolves `statusValues`, `statusDefault`, `reservedFiles`, `allowCrossWikiLinks`, and derives `archivalEnabled`. Extend it; do not replace it.
- Its content is already v0.2-clean, so this is a MINOR release: the accepted-document set shrinks only for syntax the repository never contained.
- Never push to `main`. Branch, then PR, in each repository.
- Commits: Conventional Commits, imperative subject, 50 characters or fewer, no AI attribution.
- No em dashes anywhere.

## File Structure

| File | Responsibility |
|---|---|
| `example-second-brain/lib/okf.mjs` | modified. Gains the same five validators as the template. |
| `example-second-brain/lib/config.mjs` | modified. Adds `conceptTypes` and an explicit `archival`. |
| `example-second-brain/check.mjs` | modified. Calls the validators. |
| `example-second-brain/test/okf.test.mjs` | modified. Unit tests for the validators. |
| `example-second-brain/test/check.test.mjs` | modified. End-to-end negatives. |
| `example-second-brain/CHANGELOG.md` | new. |
| `example-agent-rules/README.md` | modified. One line in "Related". |
| `example-agent-rules/CHANGELOG.md` | new. Documents the existing v1.0.0. |

---

### Task 1: Backport the prohibitions and shape validators

**Files:**
- Modify: `example-second-brain/lib/okf.mjs` (append), `check.mjs`, `test/okf.test.mjs`, `test/check.test.mjs`
- Source: `okf-wiki-template/lib/okf.mjs` (the `v0.2 profile validators` section)

**Interfaces:**
- Produces: `prohibitedKeyViolations(data)`, `citationsHeadingViolation(content)`, `isoViolations(data)`, `sourceViolations(data, content)`, `supersessionViolations(pages)`. Identical signatures and message text to the template's, so the two implementations of one profile stay readable side by side.
- `supersessionViolations` takes the whole graph as `[{ key, supersededBy }]`, not one page. A cycle is not visible from a single edge, so a per-page signature cannot detect `a -> b -> a`.

- [ ] **Step 1: Branch**

```bash
cd ~/personal/example-second-brain && git checkout -b feat/enforce-v02-renames
```

- [ ] **Step 2: Write the failing unit tests**

Append to `test/okf.test.mjs` the same six tests written in the template's Task 5 Step 1 (`test/okf.test.mjs` additions), importing from `../lib/okf.mjs`. Copy them verbatim: identical assertions in both repositories is the point, since it is the only thing keeping the two checkers honest.

- [ ] **Step 3: Run tests to verify they fail**

Run: `node --test test/okf.test.mjs`
Expected: FAIL with import errors for the five functions.

- [ ] **Step 4: Copy the validators**

Copy the entire `--- v0.2 profile validators ---` section from `okf-wiki-template/lib/okf.mjs` (the block created in the template's Task 5 Step 3) to the end of `example-second-brain/lib/okf.mjs`, unchanged.

Add a comment at the top of the copied block:

```javascript
// Kept deliberately identical to okf-wiki-template's copy of this block. Two self-contained
// checkers implement one profile; matching text is what makes a divergence visible in review.
```

- [ ] **Step 5: Run unit tests to verify they pass**

Run: `node --test test/okf.test.mjs`
Expected: PASS.

- [ ] **Step 6: Write the failing end-to-end tests**

Append to `test/check.test.mjs`, following that file's existing helper style (read it first to match how it builds a temporary bundle and invokes `check.mjs`):

```javascript
test('check fails on a prohibited timestamp key', () => {
  // build a bundle whose one concept carries `timestamp:`, run check, expect exit 1
  // and stderr matching /`timestamp` is prohibited by this profile/
});

test('check fails on a prohibited Citations heading', () => {
  // one concept with a `# Citations` heading, expect exit 1 and /use `sources:`/
});

test('check fails on an unresolved footnote marker', () => {
  // one concept with `claim[^ghost]` and no matching source id, expect /footnote \[\^ghost\]/
});

test('check fails on a dangling superseded_by even when the vocabulary lacks deprecated', () => {
  // set okf.statusValues to ['wip','done'], point superseded_by at a missing page,
  // expect exit 1 and /no such page/
});

test('check fails on a two-page superseded_by cycle', () => {
  // page a has superseded_by: t/b, page b has superseded_by: t/a, both exist,
  // expect exit 1 and /cycle/
});

test('check fails on a three-page superseded_by cycle', () => {
  // a -> b -> c -> a, all three exist, expect exit 1 and /cycle/
});
```

The two cycle tests are the reason this task exists in this form. `example-second-brain` currently
has archival-gated validation with access to a full supersession map; Task 2 deletes it. Without
these tests, that deletion would silently drop cycle detection, which the design requires
unconditionally.

Fill each body using the file's existing bundle helper. Do not leave them as comments; the comment lines above describe exactly what each body must construct.

- [ ] **Step 7: Run tests to verify they fail**

Run: `node --test test/check.test.mjs`
Expected: FAIL. `check.mjs` does not call the validators yet.

- [ ] **Step 8: Wire the validators into check.mjs**

In `check.mjs`, add the five names to the `./lib/okf.mjs` import. After the existing concept type loop (near `check.mjs:110`), insert:

```javascript
  // v0.2 profile: prohibited legacy forms, frontmatter shapes, source/footnote integrity.
  for (const c of concepts) {
    for (const m of prohibitedKeyViolations(c.data)) problems.push(`${c.key} -> ${m}`);
    const heading = citationsHeadingViolation(c.content);
    if (heading) problems.push(`${c.key} -> ${heading}`);
    for (const m of isoViolations(c.data)) problems.push(`${c.key} -> ${m}`);
    for (const m of sourceViolations(c.data, c.content)) problems.push(`${c.key} -> ${m}`);
  }
  problems.push(
    ...supersessionViolations(concepts.map((c) => ({ key: c.key, supersededBy: c.data.superseded_by })))
  );
```

`supersessionViolations` already prefixes each message with the offending page key, so it is
pushed as a whole rather than per concept.

- [ ] **Step 9: Run the full suite**

Run: `npm run check && npm test`
Expected: PASS both. The repository's own content is already v0.2-clean, so `check` must still pass with zero problems. If it does not, the failing page is a real finding: fix the page, not the checker.

- [ ] **Step 10: Commit**

```bash
git add lib/okf.mjs check.mjs test/okf.test.mjs test/check.test.mjs
git commit -m "feat: enforce the v0.2 renames in check"
```

---

### Task 2: Add configurable concept types and explicit archival

`lib/config.mjs:49` derives `archivalEnabled` from whether the vocabulary contains `deprecated`, which silently disables `superseded_by` validation for a custom vocabulary. Task 1 already made `superseded_by` validate unconditionally; this task removes the misleading derivation and adds the missing `conceptTypes` key.

**Files:**
- Modify: `lib/config.mjs`, `lib/okf.mjs` (`typeViolation`), `check.mjs`, `test/config.test.mjs`

**Interfaces:**
- Produces: `resolveOkfConfig` gains `conceptTypes` (default `['concept', 'pattern', 'worked-example']`) and `archival` (explicit boolean, default `false`). `archivalEnabled` is removed.
- Produces: `typeViolation({ area, type, conceptTypes })`, matching the template's signature.

- [ ] **Step 1: Write the failing tests**

Append to `test/config.test.mjs`:

```javascript
test('conceptTypes defaults to the built-in vocabulary and is overridable', () => {
  assert.deepEqual(resolveOkfConfig().conceptTypes, ['concept', 'pattern', 'worked-example']);
  assert.deepEqual(resolveOkfConfig({ conceptTypes: ['lesson'] }).conceptTypes, ['lesson']);
  assert.throws(() => resolveOkfConfig({ conceptTypes: [] }), /conceptTypes/);
});

test('archival is explicit, not derived from the vocabulary', () => {
  assert.equal(resolveOkfConfig().archival, false);
  assert.equal(resolveOkfConfig({ archival: true }).archival, true);
  assert.equal(resolveOkfConfig({ statusValues: ['draft', 'stable', 'deprecated'] }).archival, false);
  assert.throws(() => resolveOkfConfig({ archival: 'yes' }), /archival/);
});

test('archivalEnabled is gone', () => {
  assert.equal(resolveOkfConfig().archivalEnabled, undefined);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/config.test.mjs`
Expected: FAIL. `conceptTypes` is undefined and `archivalEnabled` still exists.

- [ ] **Step 3: Update the resolver**

In `lib/config.mjs`:

1. Add the export and default:
```javascript
export const DEFAULT_CONCEPT_TYPES = ['concept', 'pattern', 'worked-example'];
```
2. In `resolveOkfConfig`, resolve `conceptTypes` with the same non-empty-string-array validation the other array keys use, defaulting to `DEFAULT_CONCEPT_TYPES`.
3. Replace the `archivalEnabled` derivation with an explicit boolean. Find it by its exact current text rather than by line number, since step 2 above inserts code higher in the same file:

```javascript
  // Archival (`superseded_by` + `status: deprecated`) only makes sense when the vocabulary
  // actually has a `deprecated` state; without one the checks are skipped entirely.
  const archivalEnabled = statusValues.includes('deprecated');
```

Replace it with:
```javascript
  // Explicit, never inferred from whether the vocabulary happens to contain 'deprecated'.
  // `superseded_by` is validated whenever present regardless of this flag: lifecycle policy
  // and reference integrity are separate concerns.
  const archival = okf.archival === undefined ? false : okf.archival;
  if (typeof archival !== 'boolean') throw new Error('`okf.archival` must be a boolean');
```
4. Return `conceptTypes` and `archival` in place of `archivalEnabled`.

- [ ] **Step 4: Update every archivalEnabled consumer**

Run: `grep -rn "archivalEnabled" check.mjs lib scripts test`

For each hit, replace with `archival`. A check gated on `archivalEnabled` purely to validate `superseded_by` is deleted, since Task 1's unconditional validation now covers it, **including cycles**. Before deleting any such block, confirm the cycle tests from Task 1 Step 6 are present and passing; the existing gated code has the full supersession map, so deleting it without those tests silently loses cycle detection. Keep gating only for checks that genuinely depend on a `deprecated` state existing.

- [ ] **Step 5: Thread conceptTypes through typeViolation**

Apply the same change as the template's Task 3 Step 3: give `typeViolation` a `conceptTypes` parameter defaulting to the module constant, then pass `conceptTypes: CFG.conceptTypes` at the `wiki` call site in `check.mjs`. Leave the `raw` call site alone.

- [ ] **Step 6: Run the full suite**

Run: `npm run check && npm test`
Expected: PASS both.

- [ ] **Step 7: Commit**

```bash
git add lib/config.mjs lib/okf.mjs check.mjs test/config.test.mjs
git commit -m "feat: add conceptTypes and explicit archival flag"
```

---

### Task 3: Release second-brain v1.1.0

Its `package.json:3` reads `0.1.0` while the repository is tagged `v1.0.0`. Fix that drift as part of the release.

**Files:**
- Modify: `package.json`
- Create: `CHANGELOG.md`

- [ ] **Step 1: Correct the version**

In `package.json`, set `"version": "1.1.0"`.

- [ ] **Step 2: Write CHANGELOG.md**

```markdown
# Changelog

All notable changes to this starter. Format loosely follows Keep a Changelog.

| Release | OKF spec | Node |
|---|---|---|
| 1.1.0 | 0.2 | >=20 |
| 1.0.0 | 0.2 | >=20 |

## 1.1.0

MINOR: the accepted-document set shrinks only for syntax this repository never contained.

### Added
- `check` now enforces what `AGENTS.md` already required: `timestamp:` and a `# Citations`
  heading are rejected, naming `generated.at` and `sources:` as their replacements.
- Validation for `generated`, `verified`, `stale_after`, `sources` ids and footnote markers.
- `okf.conceptTypes` makes the concept vocabulary configurable.
- `okf.archival` is an explicit boolean.

### Changed
- `superseded_by` is validated whenever present, instead of only when the configured status
  vocabulary happens to contain `deprecated`. A dangling pointer is a broken link either way.
- `package.json` version now matches the release tag. It read `0.1.0` at `v1.0.0`.

### Removed
- `archivalEnabled` from the resolved config. Use `archival`.

## 1.0.0

First tagged release: check-only OKF v0.2 wiki starter, Obsidian as the UI, configurable
status vocabulary, stats, and viz export.
```

- [ ] **Step 3: Verify the gate, then commit and tag**

Run: `npm run check && npm test`
Expected: PASS both.

```bash
git add package.json CHANGELOG.md
git commit -m "chore: release v1.1.0"
```

Open the PR. Tag `v1.1.0` after it merges.

---

### Task 4: Wire the cross-repo seams

**Files:**
- Modify: `example-agent-rules/README.md` (the "Related: the knowledge wiki" section)
- Create: `example-agent-rules/CHANGELOG.md`

**Interfaces:**
- Consumes: `okf-wiki-template/docs/composing.md`, created in the template's Task 9.

- [ ] **Step 1: Branch**

```bash
cd ~/personal/example-agent-rules && git checkout -b docs/related-template
```

- [ ] **Step 2: Add the template to the Related section**

That section currently names only `example-second-brain`. Rename its heading to "Related: the knowledge repos" and add a second paragraph:

```markdown
The same split applies to [okf-wiki-template](https://github.com/het-sheth/okf-wiki-template), a
template for a knowledge base about a *subject* rather than about you: clone it once per topic you
want an agent to be able to read up on. The second brain is your own context layer, with a journal
and a capture workflow; a template clone is a subject library with neither. Both join to this
rulebook the same way, through one line in your `_machine.md` **Paths** section naming the clone.
`docs/composing.md` in that repo covers which of the three a given note belongs in.
```

- [ ] **Step 3: Write CHANGELOG.md**

```markdown
# Changelog

All notable changes to this template. Format loosely follows Keep a Changelog.

## Unreleased

### Changed
- README now names both companion knowledge repos, not just the second brain.

## 1.0.0

First tagged release: cross-agent rulebook with `assemble.sh`, `install.sh` adapters for Claude,
Codex, and Gemini, per-machine manifests, profiles, and CI enforcing the AGENTS.md size budget,
pointer targets, and a secret guard.
```

- [ ] **Step 4: Run the repository's own gate**

Run: `bash tests/run.sh && ./install.sh --dry-run`
Expected: PASS, and the dry run reports no changes.

- [ ] **Step 5: Commit**

```bash
git add README.md CHANGELOG.md
git commit -m "docs: name the wiki template in related"
```

- [ ] **Step 6: Verify the triangle closes**

Run:
```bash
grep -l "okf-wiki-template" ~/personal/example-agent-rules/README.md
grep -l "example-second-brain\|example-agent-rules" ~/personal/okf-wiki-template/README.md
grep -l "okf-wiki-template" ~/personal/example-second-brain/docs/composing.md
```
Expected: all three print a path. The third requires adding one sentence to second-brain's
`docs/composing.md` naming the template as the third option; do that in the Task 3 branch if it
has not merged, or as a follow-up commit there.

---

## Self-review

**Spec coverage.** Spec step 11 (backport `config.mjs`, the prohibitions, and `okf_version`; fix the version; tag `v1.1.0`) maps to Tasks 1 through 3. `okf_version` needs no work: `check.mjs:95` already implements it, which is where the template borrowed it from. Spec step 12 (seam lines and the agent-rules changelog) maps to Task 4.

**Placeholder check.** Task 1 Step 6 and Task 2 Steps 3 through 5 describe transformations rather than pasting final code, because the target files' surrounding style must be read first and both are near-mechanical repeats of blocks written verbatim in the template plan. Each names the exact source block to copy and the exact assertion or message text required, so nothing is left to invention.

**Type consistency.** The five validator signatures match the template's exactly, including `supersessionViolations(pages)` taking `[{ key, supersededBy }]` rather than a single page. `resolveOkfConfig` returns `archival`, never `archivalEnabled`, in both repositories after this plan. `typeViolation` takes the same optional `conceptTypes` parameter in both.

**Divergence accepted.** The template also gains `okf.needsWorkStatus`, which controls its muted card class. `example-second-brain` renders nothing (Obsidian is its UI, it has no `build.mjs`), so that key has no meaning there and is deliberately not backported. The two resolvers therefore differ by one key, which `lib/config.mjs` in each repository should note in a comment so the gap reads as intentional.

**Ordering.** Task 1 must precede Task 2, because Task 2 Step 4 deletes `superseded_by` gating that only becomes redundant once Task 1's unconditional validation exists.
