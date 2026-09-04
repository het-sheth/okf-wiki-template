# okf-wiki-template v2.0.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `okf-wiki-template` from OKF v0.1 to v0.2, make its vocabularies configurable so it works as a knowledge base for any subject, and give it a real upgrade path plus a first tagged release.

**Architecture:** All profile policy moves into a pure config resolver (`lib/config.mjs`) read from `package.json`'s existing `okf` block, so `build.mjs` stops hardcoding vocabularies. Two new scripts handle transitions: `migrate` rewrites v0.1 content to v0.2 without inventing provenance, and `upgrade` syncs engine files from a pinned, checksum-verified release (a file sync, not a git merge, because GitHub's "Use this template" produces unrelated histories). Engine tests move to self-contained fixtures so a clone's own content can never break them.

**Tech Stack:** Node 20+, ESM, `node --test`, `gray-matter` 4.0.3, `marked` 18.0.5, Python 3.11+ with `uv` for the optional ingest pipeline.

**Spec:** `docs/superpowers/specs/2026-08-20-okf-v02-template-design.md`

## Global Constraints

- Node `>=20`. ESM only (`"type": "module"`). No new npm dependencies.
- `lib/*.mjs` stays pure: no I/O, no deps, so tests call it directly. File I/O lives in `build.mjs` and `scripts/*.mjs`.
- `npm run check` is a **profile lint**, not an OKF validator. Every new error message says the key or form is "prohibited by this profile" and names the replacement. It never says a document is invalid OKF.
- Build and export paths preserve unknown frontmatter keys rather than dropping them.
- **Every task must leave `npm run check && npm test` passing at its own commit.** Tasks are reviewed independently, so a red commit is a defect even if a later task fixes it. This is why migration (Task 5) precedes enforcement (Task 6).
- Every `okf.*` code default reproduces today's behavior exactly, including rendering. A clone with no `okf` block must render byte-identical HTML before and after this release.
- The `okf` block already carries `federation` and `title` (`build.mjs:26`, `build.mjs:32`). The resolver must preserve both.
- `raw/` is immutable source material (`AGENTS.md:10`). No script in this plan may write to it. The prohibitions apply to `wiki/` concepts only, so `raw/` needs no migration.
- Legacy status vocabulary: `stub | learning | researched | solid`. Spec vocabulary: `draft | stable | deprecated`.
- Default status map: `stub -> draft`, `learning -> draft`, `researched -> stable`, `solid -> stable`.
- Python tests run as `uv run --extra dev pytest`. `pytest` is an optional extra (`ingest/pyproject.toml:12`), so a bare `uv run pytest` will not find it.
- **Do not cite line-number ranges as edit targets.** Line numbers shift as earlier tasks edit the same files. Identify the region to replace by quoting its exact current text.
- Commits: Conventional Commits, imperative subject, 50 characters or fewer, no AI attribution lines.
- No em dashes in code, comments, strings, docs, or commit messages.

## File Structure

| File | Responsibility |
|---|---|
| `lib/config.mjs` | new. Pure resolver for the `okf` block; every key defaulted. |
| `lib/okf.mjs` | modified. Add prohibition and shape validators; make `typeViolation` take a vocabulary. |
| `lib/migrate.mjs` | new. Pure v0.1 to v0.2 transforms. No I/O. |
| `lib/upgrade.mjs` | new. Pure helpers: package.json field patch, marked-block replacement, config transition. |
| `build.mjs` | modified. Load config; use it for types, the card class, and the new checks. |
| `scripts/migrate.mjs` | new. CLI wrapper: walk `wiki/` only, apply transforms, report. |
| `scripts/upgrade.mjs` | new. CLI wrapper: verified staging, atomic replace, report. |
| `test/fixtures/<case>/` | new. Self-contained bundles owned by the engine. |
| `test/config.test.mjs`, `test/migrate.test.mjs`, `test/upgrade.test.mjs` | new. |
| `docs/profile-min.md` | new. The canonical normative block injected into `AGENTS.md`. |
| `AGENTS.md` | modified. Normative block inside markers; prose outside stays clone-owned. |
| `docs/okf-profile.md`, `docs/upgrading.md`, `docs/composing.md` | new. |

## Task order and why

1. Fixtures, so engine tests stop depending on clone content.
2. Config resolver.
3. Wire config into rendering.
4. Ingest emits v0.2, **before** anything rejects v0.1.
5. Migration tooling, then migrate the shipped pages, **before** anything rejects v0.1.
6. Enforcement. Safe now: no v0.1 content remains and no tool emits it.
7. `okf_version` on the bundle root.
8. Upgrade tool.
9. Docs and the `AGENTS.md` split.
10. CI, CONTRIBUTING, CHANGELOG, tag.

---

### Task 1: Decouple engine tests from user content

`test/build-check.test.mjs` copies live `wiki/` into its sandbox and asserts the current two-concept count. Since `upgrade` replaces engine tests wholesale, a clone that wrote its own pages would fail `npm test` after upgrading.

**Files:**
- Create: `test/fixtures/minimal/`, `test/fixtures/legacy-v01/`
- Modify: `test/build-check.test.mjs` (the `sandbox` helper and every topic path)

**Interfaces:**
- Produces: `sandbox(fixture = 'minimal')` returning a temp dir path. Later tasks call `sandbox('legacy-v01')`.

- [ ] **Step 1: Create the minimal fixture**

```bash
mkdir -p test/fixtures/minimal/wiki/demo test/fixtures/minimal/raw
touch test/fixtures/minimal/raw/.gitkeep
```

`test/fixtures/minimal/topics.json`:
```json
{ "order": ["demo"] }
```

`test/fixtures/minimal/package.json`:
```json
{
  "name": "fixture-minimal",
  "private": true,
  "type": "module",
  "dependencies": { "gray-matter": "4.0.3", "marked": "18.0.5" }
}
```

`test/fixtures/minimal/wiki/demo/alpha.md`:
```markdown
---
type: concept
title: Alpha
description: The first fixture concept.
---

Alpha links to [Beta](./beta.md).
```

`test/fixtures/minimal/wiki/demo/beta.md`:
```markdown
---
type: concept
title: Beta
description: The second fixture concept.
---

Beta stands alone.
```

- [ ] **Step 2: Create the legacy v0.1 fixture**

```bash
cp -r test/fixtures/minimal test/fixtures/legacy-v01
```

Then overwrite `test/fixtures/legacy-v01/wiki/demo/alpha.md`:
```markdown
---
type: concept
title: Alpha
description: A v0.1 page.
timestamp: 2026-01-01T00:00:00Z
status: solid
---

A claim.

# Citations

- https://example.com/a
```

And `test/fixtures/legacy-v01/package.json` sets the legacy vocabulary explicitly, since this fixture represents a pre-v2 clone:
```json
{
  "name": "fixture-legacy",
  "private": true,
  "type": "module",
  "okf": { "statusValues": ["stub", "learning", "researched", "solid"], "statusDefault": null },
  "dependencies": { "gray-matter": "4.0.3", "marked": "18.0.5" }
}
```

- [ ] **Step 3: Point the sandbox helper at fixtures**

In `test/build-check.test.mjs`, replace this exact block:

```javascript
function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), 'okf-'));
  for (const p of ['build.mjs', 'lib', 'wiki', 'raw', 'assets', 'topics.json', 'package.json']) {
    cpSync(join(ROOT, p), join(dir, p), { recursive: true });
  }
  symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'), 'dir');
  return dir;
}
```

with:

```javascript
const FIXTURES = join(ROOT, 'test/fixtures');

function sandbox(fixture = 'minimal') {
  const dir = mkdtempSync(join(tmpdir(), 'okf-'));
  cpSync(join(FIXTURES, fixture), dir, { recursive: true });
  for (const p of ['build.mjs', 'lib', 'assets']) {
    cpSync(join(ROOT, p), join(dir, p), { recursive: true });
  }
  symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'), 'dir');
  return dir;
}
```

- [ ] **Step 4: Retarget every topic path in the test file**

In `test/build-check.test.mjs` only, replace `getting-started` with `demo`, `welcome` with `alpha`, and `writing-concepts` with `beta`. The two-concept assertion text is unchanged, because the fixture also has two concepts, but it now describes content the engine owns.

- [ ] **Step 5: Run the suite**

Run: `npm run check && npm test`
Expected: PASS both. `check` still validates the real `wiki/`, which is untouched.

- [ ] **Step 6: Prove the decoupling**

Run:
```bash
rm -rf /tmp/decouple && mkdir /tmp/decouple
git archive HEAD | tar -x -C /tmp/decouple
ln -s "$PWD/node_modules" /tmp/decouple/node_modules
rm -rf /tmp/decouple/wiki/getting-started
cd /tmp/decouple && npm test; cd - >/dev/null
```
Expected: PASS. Deleting the shipped topic no longer breaks engine tests. Then `rm -rf /tmp/decouple`.

- [ ] **Step 7: Commit**

```bash
git add test/fixtures test/build-check.test.mjs
git commit -m "test: move engine tests onto owned fixtures"
```

---

### Task 2: Add the config resolver

**Files:**
- Create: `lib/config.mjs`, `test/config.test.mjs`

**Interfaces:**
- Produces: `resolveOkfConfig(okf?)` returning
  `{ conceptTypes, statusValues, statusDefault, needsWorkStatus, reservedFiles, archival, federation, title }`.
  Throws `Error` on malformed input.
- Produces: `DEFAULT_CONCEPT_TYPES`, `DEFAULT_STATUS_VALUES`, `SPEC_STATUS_VALUES`, `DEFAULT_RESERVED_FILES`.

`needsWorkStatus` exists because card styling and the absent-status default are different questions. Today `build.mjs` mutes a card when `status === 'stub'`, and `stub` is not the absent-status default. Deriving the card class from `statusDefault` would silently drop that styling for every unconfigured clone.

- [ ] **Step 1: Write the failing tests**

`test/config.test.mjs`:
```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveOkfConfig, DEFAULT_CONCEPT_TYPES, DEFAULT_STATUS_VALUES, SPEC_STATUS_VALUES,
} from '../lib/config.mjs';

test('an absent okf block reproduces current behavior', () => {
  const c = resolveOkfConfig();
  assert.deepEqual(c.conceptTypes, DEFAULT_CONCEPT_TYPES);
  assert.deepEqual(c.statusValues, DEFAULT_STATUS_VALUES);
  assert.equal(c.needsWorkStatus, 'stub', 'the muted card class must keep its current trigger');
  assert.equal(c.statusDefault, null, 'the legacy vocabulary has no stable, so no silent default');
  assert.equal(c.federation, false);
  assert.equal(c.archival, false);
  assert.equal(c.title, null);
});

test('legacy defaults are the current vocabulary, not the spec one', () => {
  assert.deepEqual(DEFAULT_STATUS_VALUES, ['stub', 'learning', 'researched', 'solid']);
  assert.deepEqual(SPEC_STATUS_VALUES, ['draft', 'stable', 'deprecated']);
});

test('federation and title are preserved from the existing okf block', () => {
  const c = resolveOkfConfig({ federation: true, title: 'My Wiki' });
  assert.equal(c.federation, true);
  assert.equal(c.title, 'My Wiki');
});

test('conceptTypes and statusValues are overridable', () => {
  const c = resolveOkfConfig({ conceptTypes: ['lesson'], statusValues: ['wip', 'done'] });
  assert.deepEqual(c.conceptTypes, ['lesson']);
  assert.deepEqual(c.statusValues, ['wip', 'done']);
});

test('statusDefault resolves to stable when the vocabulary has it', () => {
  assert.equal(resolveOkfConfig({ statusValues: SPEC_STATUS_VALUES }).statusDefault, 'stable');
  assert.equal(resolveOkfConfig({ statusValues: ['wip', 'done'] }).statusDefault, null);
});

test('an explicit statusDefault must be in the vocabulary', () => {
  assert.equal(resolveOkfConfig({ statusValues: ['wip', 'done'], statusDefault: 'wip' }).statusDefault, 'wip');
  assert.throws(() => resolveOkfConfig({ statusValues: ['wip'], statusDefault: 'nope' }), /statusDefault/);
});

test('needsWorkStatus defaults to the first vocabulary value when stub is absent', () => {
  assert.equal(resolveOkfConfig({ statusValues: SPEC_STATUS_VALUES }).needsWorkStatus, 'draft');
  assert.equal(resolveOkfConfig({ statusValues: ['wip', 'done'] }).needsWorkStatus, 'wip');
  assert.equal(resolveOkfConfig({ statusValues: ['wip', 'done'], needsWorkStatus: 'done' }).needsWorkStatus, 'done');
  assert.equal(resolveOkfConfig({ needsWorkStatus: null }).needsWorkStatus, null);
  assert.throws(() => resolveOkfConfig({ statusValues: ['wip'], needsWorkStatus: 'ghost' }), /needsWorkStatus/);
});

test('archival is an explicit boolean, not derived from the vocabulary', () => {
  assert.equal(resolveOkfConfig({ statusValues: SPEC_STATUS_VALUES }).archival, false);
  assert.equal(resolveOkfConfig({ archival: true }).archival, true);
  assert.throws(() => resolveOkfConfig({ archival: 'yes' }), /archival/);
});

test('malformed input throws', () => {
  assert.throws(() => resolveOkfConfig([]), /must be an object/);
  assert.throws(() => resolveOkfConfig({ conceptTypes: [] }), /conceptTypes/);
  assert.throws(() => resolveOkfConfig({ federation: 'yes' }), /federation/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/config.test.mjs`
Expected: FAIL with "Cannot find module '../lib/config.mjs'".

- [ ] **Step 3: Write the resolver**

`lib/config.mjs`:
```javascript
// Pure resolver for package.json's `okf` block. Every key defaults to v1 behavior, so a repo
// with no `okf` key sees zero change, including in rendered HTML. No I/O, no deps.

export const DEFAULT_CONCEPT_TYPES = ['concept', 'pattern', 'worked-example'];
export const DEFAULT_STATUS_VALUES = ['stub', 'learning', 'researched', 'solid'];
export const SPEC_STATUS_VALUES = ['draft', 'stable', 'deprecated'];
export const DEFAULT_RESERVED_FILES = ['index.md', 'log.md'];

const isStringArray = (v) =>
  Array.isArray(v) && v.length > 0 && v.every((s) => typeof s === 'string' && s.trim() !== '');

const arrayKey = (okf, key, fallback) => {
  const v = okf[key] === undefined ? fallback : okf[key];
  if (!isStringArray(v)) throw new Error(`\`okf.${key}\` must be a non-empty array of strings`);
  return v;
};

const boolKey = (okf, key, fallback) => {
  const v = okf[key] === undefined ? fallback : okf[key];
  if (typeof v !== 'boolean') throw new Error(`\`okf.${key}\` must be a boolean`);
  return v;
};

// A member of `values`, or null to disable. Explicit wins; otherwise `preferred` if present,
// else the fallback picker.
function memberKey(okf, key, values, { preferred, fallback }) {
  if (okf[key] === null) return null;
  if (okf[key] !== undefined) {
    if (typeof okf[key] === 'string' && values.includes(okf[key])) return okf[key];
    throw new Error(`\`okf.${key}\` must be one of \`okf.statusValues\` or null`);
  }
  if (preferred && values.includes(preferred)) return preferred;
  return fallback(values);
}

export function resolveOkfConfig(okf = {}) {
  if (okf === null || typeof okf !== 'object' || Array.isArray(okf)) {
    throw new Error('package.json `okf` must be an object');
  }
  const conceptTypes = arrayKey(okf, 'conceptTypes', DEFAULT_CONCEPT_TYPES);
  const statusValues = arrayKey(okf, 'statusValues', DEFAULT_STATUS_VALUES);
  const reservedFiles = arrayKey(okf, 'reservedFiles', DEFAULT_RESERVED_FILES);

  // What an ABSENT `status:` means. 'stable' when the vocabulary has it (the v0.2 rule),
  // else null, because a custom vocabulary without 'stable' has no principled silent default.
  const statusDefault = memberKey(okf, 'statusDefault', statusValues, {
    preferred: 'stable', fallback: () => null,
  });

  // Which status gets the muted "needs work" card. Separate from statusDefault on purpose:
  // today's build mutes `status: stub`, and 'stub' is not the absent-status default. Deriving
  // one from the other would silently change rendering for every unconfigured clone.
  const needsWorkStatus = memberKey(okf, 'needsWorkStatus', statusValues, {
    preferred: 'stub', fallback: (v) => v[0],
  });

  // Explicit, never inferred from whether the vocabulary contains 'deprecated'. `superseded_by`
  // is validated whenever present regardless: lifecycle policy and reference integrity are
  // separate concerns.
  const archival = boolKey(okf, 'archival', false);
  const federation = boolKey(okf, 'federation', false);

  const title = okf.title === undefined ? null : okf.title;
  if (title !== null && typeof title !== 'string') throw new Error('`okf.title` must be a string');

  return {
    conceptTypes, statusValues, statusDefault, needsWorkStatus,
    reservedFiles, archival, federation, title,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/config.test.mjs`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/config.mjs test/config.test.mjs
git commit -m "feat: add okf config resolver"
```

---

### Task 3: Make build.mjs read the config

Removes the two hardcoded vocabularies: the concept types in `typeViolation`, and `status === 'stub'` in the card markup.

**Files:**
- Modify: `lib/okf.mjs` (`typeViolation`), `build.mjs` (config load, card markup, type checks), `assets/wiki.css`
- Modify: `test/okf.test.mjs`, `test/build-check.test.mjs`

**Interfaces:**
- Consumes: `resolveOkfConfig` from Task 2.
- Produces: `typeViolation({ area, type, conceptTypes })`, where `conceptTypes` is optional and defaults to `WIKI_CONCEPT_TYPES`.
- Produces: module-level `CFG` in `build.mjs`, used by Tasks 6 and 7.
- Produces: the rendered card class is a stable `needs-work`, never the status word, so CSS does not depend on the configured vocabulary.

- [ ] **Step 1: Write the failing tests**

Append to `test/okf.test.mjs`:
```javascript
test('typeViolation accepts a custom concept vocabulary', () => {
  assert.equal(typeViolation({ area: 'wiki', type: 'lesson', conceptTypes: ['lesson'] }), null);
  assert.match(
    typeViolation({ area: 'wiki', type: 'concept', conceptTypes: ['lesson'] }),
    /expected one of lesson/
  );
});

test('typeViolation without a vocabulary keeps the built-in default', () => {
  assert.equal(typeViolation({ area: 'wiki', type: 'concept' }), null);
});
```

Append to `test/build-check.test.mjs`:
```javascript
test('check accepts a custom conceptTypes vocabulary', () => {
  const dir = sandbox();
  setOkf(dir, { conceptTypes: ['lesson'] });
  for (const slug of ['alpha', 'beta']) {
    writeFileSync(join(dir, `wiki/demo/${slug}.md`),
      `---\ntype: lesson\ntitle: ${slug}\ndescription: d\n---\n\nbody\n`);
  }
  const r = run(dir, '--check');
  clean(dir);
  assert.equal(r.status, 0, `expected pass; stderr=${r.stderr}`);
});

test('an unconfigured clone still mutes a stub card', () => {
  const dir = sandbox();
  writeFileSync(join(dir, 'wiki/demo/alpha.md'),
    '---\ntype: concept\ntitle: A\ndescription: d\nstatus: stub\n---\n\nbody\n');
  const r = run(dir);
  const html = readFileSync(join(dir, 'site/index.html'), 'utf8');
  clean(dir);
  assert.equal(r.status, 0, r.stderr);
  assert.match(html, /class="card needs-work"/);
});

test('a custom vocabulary mutes its own needs-work status', () => {
  const dir = sandbox();
  setOkf(dir, { statusValues: ['wip', 'done'], needsWorkStatus: 'wip' });
  writeFileSync(join(dir, 'wiki/demo/alpha.md'),
    '---\ntype: concept\ntitle: A\ndescription: d\nstatus: wip\n---\n\nbody\n');
  const r = run(dir);
  const html = readFileSync(join(dir, 'site/index.html'), 'utf8');
  clean(dir);
  assert.equal(r.status, 0, r.stderr);
  assert.match(html, /class="card needs-work"/);
  assert.ok(!html.includes('class="card wip"'), 'the status word must not become a class');
});
```

Add this helper next to the existing `enableFederation` helper in that file, and rewrite `enableFederation` to use it:
```javascript
// Merge keys into the sandbox package.json `okf` block.
function setOkf(dir, okf) {
  const pkgPath = join(dir, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  pkg.okf = { ...(pkg.okf || {}), ...okf };
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
}

function enableFederation(dir) { setOkf(dir, { federation: true }); }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/okf.test.mjs test/build-check.test.mjs`
Expected: FAIL. `typeViolation` ignores `conceptTypes`; the card class is `stub`, not `needs-work`.

- [ ] **Step 3: Thread the vocabulary through typeViolation**

In `lib/okf.mjs`, replace this exact function:
```javascript
export function typeViolation({ area, type }) {
  if (!type) return 'missing required `type`';
  if (area === 'raw') return type === 'source' ? null : 'expected type "source"';
  if (area === 'wiki') {
    return WIKI_CONCEPT_TYPES.includes(type)
      ? null
      : `expected one of ${WIKI_CONCEPT_TYPES.join(', ')}`;
  }
  return `unknown area "${area}"`;
}
```
with:
```javascript
// `conceptTypes` defaults to the built-in vocabulary so callers that predate configurable
// types keep working unchanged.
export function typeViolation({ area, type, conceptTypes = WIKI_CONCEPT_TYPES }) {
  if (!type) return 'missing required `type`';
  if (area === 'raw') return type === 'source' ? null : 'expected type "source"';
  if (area === 'wiki') {
    return conceptTypes.includes(type) ? null : `expected one of ${conceptTypes.join(', ')}`;
  }
  return `unknown area "${area}"`;
}
```

- [ ] **Step 4: Load the config in build.mjs**

Add `resolveOkfConfig` to the imports from `./lib/config.mjs`. Immediately after the line `const PKG = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));`, add:
```javascript
const CFG = resolveOkfConfig(PKG.okf);
```

Replace the exact line `const WIKI_TITLE = (PKG.okf && PKG.okf.title) || WIKI_NAME;` with:
```javascript
const WIKI_TITLE = CFG.title || WIKI_NAME;
```

Replace the exact line `const FEDERATION = !!(PKG.okf && PKG.okf.federation);` with:
```javascript
const FEDERATION = CFG.federation;
```

- [ ] **Step 5: Use the vocabulary in the wiki type check**

In `validate`, replace the exact line:
```javascript
    const v = typeViolation({ area: 'wiki', type: c.data.type });
```
with:
```javascript
    const v = typeViolation({ area: 'wiki', type: c.data.type, conceptTypes: CFG.conceptTypes });
```
Leave the `raw` call site unchanged: `source` is fixed by the spec and not configurable.

- [ ] **Step 6: Make the card class vocabulary-independent**

Add this helper next to the other small helpers in `build.mjs`:
```javascript
// The muted card marks work in progress. The emitted class is a stable `needs-work` rather
// than the status word, so assets/wiki.css does not depend on the configured vocabulary.
const cardClass = (status) =>
  CFG.needsWorkStatus && status === CFG.needsWorkStatus ? 'card needs-work' : 'card';
```

Then replace this exact fragment in the card template:
```javascript
    `<a class="card${c.data.status === 'stub' ? ' stub' : ''}" href="${hrefPrefix}${c.slug}.html">`
```
with:
```javascript
    `<a class="${cardClass(c.data.status)}" href="${hrefPrefix}${c.slug}.html">`
```

- [ ] **Step 7: Rename the CSS selectors, keeping the declarations exactly**

In `assets/wiki.css`, replace these two exact rules:
```css
.card.stub { opacity: .48; }
.card.stub .card-title::after { content: "  \00b7 planned"; font-size: .7rem; color: var(--text-faint); font-weight: 400; }
```
with:
```css
.card.needs-work { opacity: .48; }
.card.needs-work .card-title::after { content: "  \00b7 planned"; font-size: .7rem; color: var(--text-faint); font-weight: 400; }
```

Declarations are byte-identical; only the selector changes, so an unconfigured clone renders exactly as before.

- [ ] **Step 8: Run the suite**

Run: `npm run check && npm test`
Expected: PASS both.

- [ ] **Step 9: Verify rendering did not change for the real wiki**

Run:
```bash
git stash && npm run build && cp -r site /tmp/site-before && git stash pop && npm run build && diff -r /tmp/site-before site && echo RENDER_IDENTICAL
```
Expected: `RENDER_IDENTICAL`. The shipped pages carry `status: solid`, which is not `needsWorkStatus`, so no card class changes. Then `rm -rf /tmp/site-before`.

- [ ] **Step 10: Commit**

```bash
git add lib/okf.mjs build.mjs assets/wiki.css test/okf.test.mjs test/build-check.test.mjs
git commit -m "feat: drive vocabularies from okf config"
```

---

### Task 4: Update ingest to emit v0.2

Must precede Task 6. `ingest/ingest/draft.py` emits `status: stub`, `timestamp:`, and a `# Citations` section, all prohibited once Task 6 lands.

**Files:**
- Modify: `ingest/ingest/draft.py`, `ingest/ingest/cli.py`, `ingest/tests/test_draft.py`, `ingest/tests/test_integration.py`

**Interfaces:**
- Produces: `build_stub(*, title, raw_path, headings, timestamp, status)`. `status` is required and must be non-empty.
- Produces: a stub whose body contains a `[^raw-source]` marker, so the emitted `sources:` entry is not orphaned under Task 6's rules.
- Produces: `resolve_status(root)` in `cli.py`, which tolerates a missing `package.json`.

- [ ] **Step 1: Rewrite the three existing draft tests**

The existing tests call `build_stub` without `status` and assert the prohibited output. Update all three call sites in `ingest/tests/test_draft.py` to pass `status="draft"`, and replace their legacy assertions. Specifically, in `test_build_stub_with_headings_is_strict_profile`, replace these exact assertions:
```python
    assert "status: stub" in out
    assert "timestamp: 2026-06-27T00:00:00Z" in out
    assert "sources:" not in out        # dialect field dropped
    assert "# Citations" in out
    assert "`raw/system-design/deck.md`" in out
```
with:
```python
    assert "status: draft" in out
    assert 'generated: { by: "tool:ingest", at: "2026-06-27T00:00:00Z" }' in out
    assert "timestamp:" not in out
    assert "sources:" in out            # v0.2 replaces the Citations heading
    assert "# Citations" not in out
    assert "[^raw-source]" in out       # the source must be referenced, not just declared
    assert "raw/system-design/deck.md" in out
```
Keep the `assert "topic:" not in out` line: the dialect field is still dropped.

- [ ] **Step 2: Add the new draft tests**

Append to `ingest/tests/test_draft.py`:
```python
def test_stub_requires_a_status():
    with pytest.raises(ValueError):
        build_stub(title="T", raw_path="r.md", headings=[], timestamp="t", status="")
```
Add `import pytest` at the top if absent.

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd ingest && uv run --extra dev pytest tests/test_draft.py -v`
Expected: FAIL. `build_stub` has no `status` parameter.

- [ ] **Step 4: Rewrite build_stub**

In `ingest/ingest/draft.py`, replace the whole `build_stub` function with:
```python
def build_stub(*, title: str, raw_path: str, headings: list[str], timestamp: str, status: str) -> str:
    if not status:
        raise ValueError(
            "ingest needs a resolvable status: set `okf.statusDefault` in package.json"
        )
    front = (
        "---\n"
        "type: concept\n"
        f"title: {yaml_str(title)}\n"
        f"status: {status}\n"
        f'generated: {{ by: "tool:ingest", at: "{timestamp}" }}\n'
        f"resource: {yaml_str(raw_path)}\n"
        "sources:\n"
        "  - id: raw-source\n"
        f"    resource: {yaml_str(raw_path)}\n"
        f"    title: {yaml_str(title)}\n"
        "---\n"
    )
    outline = (BANNER + "\n\n" + "\n\n".join(headings) + "\n") if headings else (NO_OUTLINE + "\n")
    # The marker keeps the declared source from being orphaned under the v0.2 profile: every
    # declared source id must be referenced from the body.
    attribution = f"\nExtracted from the source document.[^raw-source]\n\n[^raw-source]: {raw_path}\n"
    return front + "\n" + outline + attribution
```

- [ ] **Step 5: Resolve the status in the CLI, tolerating no package.json**

In `ingest/ingest/cli.py`, add `import json` if absent, then add this function above `main`:
```python
LEGACY_STATUS_VALUES = ["stub", "learning", "researched", "solid"]


def resolve_status(root) -> str:
    """The status an ingested stub carries. A wiki root with no package.json (a bare
    --wiki-root, as the integration tests use) falls back to the legacy vocabulary's
    first value, which is what this pipeline has always emitted."""
    pkg = root / "package.json"
    if not pkg.exists():
        return LEGACY_STATUS_VALUES[0]
    okf = json.loads(pkg.read_text()).get("okf", {})
    values = okf.get("statusValues") or LEGACY_STATUS_VALUES
    explicit = okf.get("statusDefault")
    if explicit:
        return explicit
    if "stable" in values:
        return "stable"
    return values[0]
```

Then pass `status=resolve_status(root)` to the `build_stub` call.

This resolves finding 4 of the first review deliberately: a missing config is an **ingest-safe default**, not a failure, because the integration tests and any bare `--wiki-root` invocation legitimately have no `package.json`. The failure mode the spec asked for is preserved where it matters: `build_stub` still raises on an empty status, so a genuinely unresolvable configuration cannot silently emit a blank one.

- [ ] **Step 6: Update the integration tests**

In `ingest/tests/test_integration.py`, the `_run` helper builds a bare temp root. Add an explicit `package.json` so the tests exercise a configured wiki rather than the fallback, and add one test for the fallback. Replace the `_run` helper with:
```python
def _run(tmp_path, src, engine, okf=None):
    for d in ("raw", "wiki"):
        (tmp_path / d).mkdir(parents=True, exist_ok=True)
    if okf is not None:
        (tmp_path / "package.json").write_text(json.dumps({"name": "t", "okf": okf}))
    return main([str(src), "--topic", "test", "--engine", engine, "--wiki-root", str(tmp_path)])
```
Add `import json` at the top. Update existing callers that assert on status to pass
`okf={"statusValues": ["draft", "stable", "deprecated"], "statusDefault": "stable"}`, and assert
`status: stable` where they previously asserted `status: stub`. Callers that do not assert on
status can keep calling `_run` with no `okf`.

Add:
```python
def test_missing_package_json_uses_the_legacy_default_status(tmp_path):
    _run(tmp_path, FIX / "headingless.txt", "markitdown")
    stub = (tmp_path / "wiki/test/headingless.md").read_text()
    assert "status: stub" in stub
    assert "timestamp:" not in stub
```

- [ ] **Step 7: Run the Python suite**

Run: `cd ingest && uv run --extra dev pytest -v`
Expected: PASS, all tests.

- [ ] **Step 8: Verify an ingested stub passes the Node gate**

Run:
```bash
npm run ingest -- ingest/fixtures/headingless.txt --topic demo-ingest --title "Ingest smoke"
npm run check
```
Expected: `check` passes. Then remove the generated files:
`rm -rf wiki/demo-ingest raw/demo-ingest` and re-run `npm run check` to confirm a clean tree.

This step is what proves Task 4's ordering claim. If `check` fails here, the stub's `sources`/marker pairing is wrong and must be fixed before Task 6.

- [ ] **Step 9: Commit**

```bash
git add ingest
git commit -m "feat(ingest): emit v0.2 frontmatter"
```

---

### Task 5: Migration tooling, then migrate the shipped pages

Runs **before** enforcement so that no commit leaves `npm run check` failing.

**Files:**
- Create: `lib/migrate.mjs`, `scripts/migrate.mjs`, `test/migrate.test.mjs`
- Modify: `package.json` (the `migrate` script and the `okf` block), `wiki/getting-started/welcome.md`, `wiki/getting-started/writing-concepts.md`

**Interfaces:**
- Produces: `DEFAULT_STATUS_MAP`, `parseStatusMap(spec)`, `migrateFrontmatter(data, opts)` returning `{ data, notes }`, `migrateBody(content, existingIds)` returning `{ content, sources, notes }`.
- Produces: `npm run migrate` with `--generated-by <actor>` and `--status-map <old>=<new>,...`.
- Scope: `wiki/` only, skipping reserved files. `raw/` is immutable (`AGENTS.md:10`) and the prohibitions do not apply to it, so it is never touched.

- [ ] **Step 1: Write the failing tests**

`test/migrate.test.mjs`:
```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_STATUS_MAP, migrateFrontmatter, migrateBody, parseStatusMap,
} from '../lib/migrate.mjs';

test('the default status map covers the legacy vocabulary', () => {
  assert.deepEqual(DEFAULT_STATUS_MAP,
    { stub: 'draft', learning: 'draft', researched: 'stable', solid: 'stable' });
});

test('timestamp moves to legacy_timestamp by default, claiming nothing', () => {
  const { data } = migrateFrontmatter({ type: 'concept', timestamp: '2026-01-01T00:00:00Z' }, {});
  assert.equal(data.timestamp, undefined);
  assert.equal(data.legacy_timestamp, '2026-01-01T00:00:00Z');
  assert.equal(data.generated, undefined);
});

test('--generated-by promotes timestamp to real provenance', () => {
  const { data } = migrateFrontmatter(
    { type: 'concept', timestamp: '2026-01-01T00:00:00Z' }, { generatedBy: 'human:het' });
  assert.deepEqual(data.generated, { by: 'human:het', at: '2026-01-01T00:00:00Z' });
  assert.equal(data.legacy_timestamp, undefined);
});

test('status values map through the table', () => {
  assert.equal(migrateFrontmatter({ status: 'solid' }, {}).data.status, 'stable');
  assert.equal(migrateFrontmatter({ status: 'stub' }, {}).data.status, 'draft');
});

test('an unmapped status is left alone and reported', () => {
  const { data, notes } = migrateFrontmatter({ status: 'mystery' }, {});
  assert.equal(data.status, 'mystery');
  assert.match(notes.join('\n'), /unmapped status `mystery`/);
});

test('a Citations list becomes sources with resolving footnote markers', () => {
  const { content, sources } = migrateBody(
    'A claim.\n\n# Citations\n\n- https://example.com/a\n- `raw/t/f.md`\n', new Set());
  assert.ok(!content.includes('# Citations'));
  assert.equal(sources.length, 2);
  assert.equal(sources[0].resource, 'https://example.com/a');
  assert.equal(sources[1].resource, 'raw/t/f.md');
  assert.ok(sources.every((s) => s.id && s.title));
  for (const s of sources) {
    assert.ok(content.includes(`[^${s.id}]`), `an inline marker for ${s.id}`);
    assert.ok(content.includes(`[^${s.id}]: `), `a definition for ${s.id}`);
  }
});

test('generated ids never collide with ids the page already declares', () => {
  const { sources } = migrateBody(
    'A.\n\n# Citations\n\n- https://example.com/a\n', new Set(['example-com-a']));
  assert.notEqual(sources[0].id, 'example-com-a');
});

test('a body with no Citations section is untouched', () => {
  const { content, sources } = migrateBody('Just prose.\n', new Set());
  assert.equal(content, 'Just prose.\n');
  assert.deepEqual(sources, []);
});

test('migration is idempotent', () => {
  const once = migrateFrontmatter({ timestamp: '2026-01-01T00:00:00Z', status: 'solid' }, {});
  const twice = migrateFrontmatter(once.data, {});
  assert.deepEqual(twice.data, once.data);
  const b1 = migrateBody('A.\n\n# Citations\n\n- https://e.com/a\n', new Set());
  const b2 = migrateBody(b1.content, new Set(b1.sources.map((s) => s.id)));
  assert.equal(b2.content, b1.content);
  assert.deepEqual(b2.sources, []);
});

test('parseStatusMap reads the CLI form and extends the default', () => {
  const m = parseStatusMap('mystery=draft,solid=deprecated');
  assert.equal(m.mystery, 'draft');
  assert.equal(m.solid, 'deprecated');
  assert.equal(m.stub, 'draft');
  assert.throws(() => parseStatusMap('garbage'), /expected `old=new`/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/migrate.test.mjs`
Expected: FAIL with "Cannot find module '../lib/migrate.mjs'".

- [ ] **Step 3: Write the pure transforms**

`lib/migrate.mjs`:
```javascript
// Pure v0.1 -> v0.2 transforms. No I/O, no deps, so tests call them directly.
//
// The rule that shapes everything here: `generated.by` records WHO produced a page, and a v0.1
// page does not carry that fact. So the default path never writes it. `legacy_timestamp` is an
// extension key that makes no provenance claim, which is what lets the default finish in a state
// `check` accepts without inventing an author.

export const DEFAULT_STATUS_MAP = {
  stub: 'draft', learning: 'draft', researched: 'stable', solid: 'stable',
};

export function parseStatusMap(spec) {
  const out = { ...DEFAULT_STATUS_MAP };
  if (!spec) return out;
  for (const pair of String(spec).split(',')) {
    const [from, to] = pair.split('=');
    if (!from || !to) throw new Error(`bad --status-map entry "${pair}": expected \`old=new\``);
    out[from.trim()] = to.trim();
  }
  return out;
}

export function migrateFrontmatter(input, { generatedBy = null, statusMap = DEFAULT_STATUS_MAP } = {}) {
  const data = { ...input };
  const notes = [];

  if (data.timestamp !== undefined) {
    const at = data.timestamp;
    delete data.timestamp;
    if (generatedBy) data.generated = { by: generatedBy, at };
    else data.legacy_timestamp = at;
  }

  if (data.status !== undefined) {
    const mapped = statusMap[data.status];
    if (mapped) data.status = mapped;
    else notes.push(`unmapped status \`${data.status}\` left as is; use --status-map to convert it`);
  }

  return { data, notes };
}

const slugifyId = (resource, i) => {
  const base = String(resource)
    .replace(/^https?:\/\//, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .split('-').filter(Boolean).slice(0, 4).join('-');
  return base || `source-${i + 1}`;
};

const CITATIONS_BLOCK = /\n#{1,6}[ \t]+Citations[ \t]*\n([\s\S]*?)(?=\n#{1,6}[ \t]|$)/;

// A `# Citations` list becomes `sources:` entries, an inline marker per source, and a definition
// list. `existingIds` are ids the page already declares in frontmatter, so a generated id can
// never collide with one and trip the duplicate-id check.
export function migrateBody(content, existingIds = new Set()) {
  const m = CITATIONS_BLOCK.exec(content);
  if (!m) return { content, sources: [], notes: [] };

  const items = m[1].split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('- '))
    .map((l) => l.slice(2).trim().replace(/^`|`$/g, ''));

  const taken = new Set(existingIds);
  const sources = items.map((resource, i) => {
    const base = slugifyId(resource, i);
    let id = base;
    let n = 2;
    while (taken.has(id)) id = `${base}-${n++}`;
    taken.add(id);
    return { id, resource, title: resource };
  });

  let body = content.replace(CITATIONS_BLOCK, '\n').replace(/\s*$/, '');
  if (sources.length) {
    const markers = sources.map((s) => `[^${s.id}]`).join('');
    const defs = sources.map((s) => `[^${s.id}]: ${s.resource}`).join('\n');
    // Markers attach to a sourced-material sentence rather than to an arbitrary claim: the
    // original page cited at page level, so nothing finer is knowable from the input.
    body = `${body}\n\nSourced material.${markers}\n\n${defs}\n`;
  } else {
    body = `${body}\n`;
  }
  return { content: body, sources, notes: [] };
}
```

- [ ] **Step 4: Run unit tests to verify they pass**

Run: `node --test test/migrate.test.mjs`
Expected: PASS, 10 tests.

- [ ] **Step 5: Write the CLI wrapper**

`scripts/migrate.mjs`:
```javascript
#!/usr/bin/env node
// Rewrites v0.1 wiki content to v0.2 in place. Idempotent: a second run changes nothing.
//
// Scope is `wiki/` only. `raw/` is immutable source material and the profile's prohibitions do
// not apply to it, so it is never read for writing here.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, relative, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { migrateFrontmatter, migrateBody, parseStatusMap } from '../lib/migrate.mjs';
import { resolveOkfConfig } from '../lib/config.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i === -1 ? null : argv[i + 1];
};

const generatedBy = flag('--generated-by');
const statusMap = parseStatusMap(flag('--status-map'));
const CFG = resolveOkfConfig(JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).okf);

const walk = (dir) => {
  let out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out = out.concat(walk(p));
    else if (e.name.endsWith('.md')) out.push(p);
  }
  return out;
};

const wikiDir = join(ROOT, 'wiki');
if (!existsSync(wikiDir)) {
  console.log('migrate: no wiki/ directory, nothing to do');
  process.exit(0);
}

let changed = 0;
const notes = [];
for (const file of walk(wikiDir)) {
  const rel = relative(ROOT, file);
  // Reserved files carry no frontmatter, except the bundle root's lone okf_version. Neither
  // needs migrating, and round-tripping them through matter.stringify would reformat them.
  if (CFG.reservedFiles.includes(basename(file))) continue;
  const raw = readFileSync(file, 'utf8');
  if (!raw.startsWith('---')) continue;

  const parsed = matter(raw);
  const existingIds = new Set((parsed.data.sources || []).map((s) => s && s.id).filter(Boolean));
  const fm = migrateFrontmatter(parsed.data, { generatedBy, statusMap });
  const body = migrateBody(parsed.content, existingIds);

  const data = { ...fm.data };
  if (body.sources.length) data.sources = [...(data.sources || []), ...body.sources];
  for (const n of [...fm.notes, ...body.notes]) notes.push(`${rel}: ${n}`);

  // Write only when a transform actually changed something, so an already-migrated file is
  // never reformatted just by being visited.
  const fmChanged = JSON.stringify(data) !== JSON.stringify(parsed.data);
  const bodyChanged = body.content !== parsed.content;
  if (!fmChanged && !bodyChanged) continue;

  writeFileSync(file, matter.stringify(body.content, data));
  changed += 1;
  console.log(`migrated ${rel}`);
}

console.log(`\nmigrate: ${changed} file(s) changed`);
if (notes.length) {
  console.log('\nneeds a human:');
  for (const n of notes) console.log(`  ${n}`);
}
if (!generatedBy) {
  console.log('\nnote: `timestamp` moved to `legacy_timestamp`, which claims no provenance.');
  console.log('      Re-run with --generated-by <actor> to record real provenance instead.');
}
```

- [ ] **Step 6: Register the script**

In `package.json` `scripts`, add:
```json
    "migrate": "node scripts/migrate.mjs",
```

- [ ] **Step 7: Add the end-to-end migration test**

Append to `test/migrate.test.mjs`:
```javascript
import { spawnSync } from 'node:child_process';
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function migrateSandbox() {
  const dir = mkdtempSync(join(tmpdir(), 'okf-mig-'));
  cpSync(join(ROOT, 'test/fixtures/legacy-v01'), dir, { recursive: true });
  for (const p of ['build.mjs', 'lib', 'scripts', 'assets']) {
    cpSync(join(ROOT, p), join(dir, p), { recursive: true });
  }
  symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'), 'dir');
  return dir;
}

test('migrate converts a v0.1 page and twice is a no-op', () => {
  const dir = migrateSandbox();
  const r1 = spawnSync('node', ['scripts/migrate.mjs'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r1.status, 0, r1.stderr);

  const after = readFileSync(join(dir, 'wiki/demo/alpha.md'), 'utf8');
  assert.ok(after.includes('legacy_timestamp'), 'timestamp must become legacy_timestamp');
  assert.ok(!/\ntimestamp:/.test(after), 'no timestamp key may survive');
  assert.ok(!/generated:/.test(after), 'no provenance may be invented');
  assert.ok(after.includes('status: stable'), 'solid must map to stable');
  assert.ok(!after.includes('# Citations'), 'the Citations heading must be gone');
  assert.ok(after.includes('sources:'), 'sources must be declared');
  assert.match(after, /\[\^example-com-a\]/, 'a footnote marker must be present');

  spawnSync('node', ['scripts/migrate.mjs'], { cwd: dir, encoding: 'utf8' });
  assert.equal(readFileSync(join(dir, 'wiki/demo/alpha.md'), 'utf8'), after, 'second run is a no-op');
  rmSync(dir, { recursive: true, force: true });
});

test('migrate never touches raw/ or reserved files', () => {
  const dir = migrateSandbox();
  writeFileSync(join(dir, 'raw/source.md'),
    '---\ntype: source\ntitle: S\ntimestamp: 2026-01-01T00:00:00Z\n---\n\n# Citations\n\n- x\n');
  writeFileSync(join(dir, 'wiki/index.md'), '---\nokf_version: "0.2"\n---\n\n# Fixture\n');
  const rawBefore = readFileSync(join(dir, 'raw/source.md'), 'utf8');
  const idxBefore = readFileSync(join(dir, 'wiki/index.md'), 'utf8');

  spawnSync('node', ['scripts/migrate.mjs'], { cwd: dir, encoding: 'utf8' });

  assert.equal(readFileSync(join(dir, 'raw/source.md'), 'utf8'), rawBefore, 'raw/ is immutable');
  assert.equal(readFileSync(join(dir, 'wiki/index.md'), 'utf8'), idxBefore, 'reserved files untouched');
  rmSync(dir, { recursive: true, force: true });
});
```

- [ ] **Step 8: Run the test**

Run: `node --test test/migrate.test.mjs`
Expected: PASS.

- [ ] **Step 9: Migrate the shipped topic**

Run: `npm run migrate`
Expected: two files change, `wiki/getting-started/welcome.md` and `writing-concepts.md`. `wiki/index.md` does not exist yet (Task 7 creates it), and `raw/` is out of scope.

Inspect both files. Each should now carry `legacy_timestamp`, `status: stable`, a `sources:` block, and footnote markers with definitions. Read the migrated prose and fix any sentence the mechanical marker insertion made awkward: the tool cannot know which claim each source supports, and these two pages are the first thing a new clone reads.

- [ ] **Step 10: Adopt the spec vocabulary**

Now that the content matches it, set the block in `package.json`:
```json
  "okf": {
    "conceptTypes": ["concept", "pattern", "worked-example"],
    "statusValues": ["draft", "stable", "deprecated"],
    "statusDefault": "stable",
    "needsWorkStatus": "draft",
    "reservedFiles": ["index.md", "log.md"],
    "archival": false,
    "federation": false
  },
```

- [ ] **Step 11: Verify the gate**

Run: `npm run check && npm test`
Expected: PASS both. Nothing enforces the prohibitions yet, but the content is already clean, which is what makes Task 6 safe.

- [ ] **Step 12: Commit**

```bash
git add lib/migrate.mjs scripts/migrate.mjs test/migrate.test.mjs package.json wiki
git commit -m "feat: add v0.2 migration and migrate shipped pages"
```

---

### Task 6: Enforce the v0.2 profile

Safe to land now: Task 4 stopped ingest emitting v0.1, and Task 5 cleaned the shipped content.

**Files:**
- Modify: `lib/okf.mjs` (append validators), `build.mjs` (`validate`)
- Modify: `test/okf.test.mjs`, `test/build-check.test.mjs`

**Interfaces:**
- Produces, all pure, all in `lib/okf.mjs`:
  - `prohibitedKeyViolations(data)` returns `string[]`
  - `citationsHeadingViolation(content)` returns `string|null`
  - `isoViolations(data)` returns `string[]`
  - `sourceViolations(data, content)` returns `string[]`
  - `supersessionViolations(pages)` returns `string[]`, where `pages` is `[{ key, supersededBy }]`. It takes the whole graph, not one page, because cycle detection is impossible from a single edge.

- [ ] **Step 1: Write the failing unit tests**

Append to `test/okf.test.mjs`, adding the five names to the existing import from `../lib/okf.mjs`:
```javascript
test('timestamp is prohibited and names its replacement', () => {
  const v = prohibitedKeyViolations({ timestamp: '2026-01-01T00:00:00Z' });
  assert.equal(v.length, 1);
  assert.match(v[0], /`timestamp` is prohibited by this profile; use `generated.at`/);
});

test('legacy_timestamp is allowed because it claims nothing', () => {
  assert.deepEqual(prohibitedKeyViolations({ legacy_timestamp: '2026-01-01T00:00:00Z' }), []);
});

test('a Citations heading is prohibited and names its replacement', () => {
  assert.match(citationsHeadingViolation('body\n\n# Citations\n\n- x\n'), /use `sources:`/);
  assert.equal(citationsHeadingViolation('body\n\n## Citations in context\n'), null);
  assert.equal(citationsHeadingViolation('```\n# Citations\n```\n'), null);
});

test('generated and verified must carry by and at', () => {
  assert.deepEqual(isoViolations({ generated: { by: 'human:x', at: '2026-01-01T00:00:00Z' } }), []);
  assert.match(isoViolations({ generated: { at: '2026-01-01T00:00:00Z' } })[0], /`generated.by`/);
  assert.match(isoViolations({ generated: { by: 'x', at: 'nope' } })[0], /not ISO 8601/);
  assert.match(isoViolations({ verified: { by: 'x', at: '2026-01-01T00:00:00Z' } })[0], /must be a list/);
  assert.deepEqual(isoViolations({ stale_after: '2027-01-01' }), []);
  assert.match(isoViolations({ stale_after: '2027-13-99' })[0], /not an ISO date/);
});

test('source ids must be unique and every footnote must resolve', () => {
  const data = { sources: [{ id: 'a', resource: 'r', title: 't' }] };
  assert.deepEqual(sourceViolations(data, 'claim[^a]\n\n[^a]: note\n'), []);
  assert.match(sourceViolations(data, 'claim[^ghost]\n')[0], /\[\^ghost\]/);
  assert.match(sourceViolations(data, 'no markers here\n')[0], /orphaned/);
  const dupe = {
    sources: [{ id: 'a', resource: 'r', title: 't' }, { id: 'a', resource: 'r2', title: 't2' }],
  };
  assert.match(sourceViolations(dupe, 'x[^a]\n')[0], /duplicate source id/);
  assert.match(sourceViolations({ sources: [{ id: 'a' }] }, 'x[^a]\n')[0], /missing `resource`/);
});

test('supersession rejects missing targets, self-links, and cycles of any length', () => {
  const ok = [{ key: 't/old', supersededBy: 't/new' }, { key: 't/new', supersededBy: undefined }];
  assert.deepEqual(supersessionViolations(ok), []);

  assert.match(supersessionViolations([{ key: 't/a', supersededBy: 't/ghost' }])[0], /no such page/);
  assert.match(supersessionViolations([{ key: 't/a', supersededBy: 't/a' }])[0], /points at itself/);

  const two = [{ key: 't/a', supersededBy: 't/b' }, { key: 't/b', supersededBy: 't/a' }];
  assert.match(supersessionViolations(two).join('\n'), /cycle/);

  const three = [
    { key: 't/a', supersededBy: 't/b' },
    { key: 't/b', supersededBy: 't/c' },
    { key: 't/c', supersededBy: 't/a' },
  ];
  assert.match(supersessionViolations(three).join('\n'), /cycle/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/okf.test.mjs`
Expected: FAIL with import errors for the five functions.

- [ ] **Step 3: Write the validators**

Append to `lib/okf.mjs`:
```javascript
// --- v0.2 profile validators ------------------------------------------------
//
// These are AUTHORING-PROFILE rules, stricter than OKF itself: the spec requires consumers to
// tolerate unknown keys, so a document these reject can still be valid OKF. Message text
// therefore says "prohibited by this profile" and never "invalid OKF".

const PROHIBITED_KEYS = { timestamp: '`generated.at`' };

export function prohibitedKeyViolations(data) {
  return Object.keys(PROHIBITED_KEYS)
    .filter((k) => data[k] !== undefined)
    .map((k) => `\`${k}\` is prohibited by this profile; use ${PROHIBITED_KEYS[k]}`);
}

// Strips fenced code before scanning, so a heading shown as an example inside a code block is
// not mistaken for a real one.
const stripFences = (md) => String(md).replace(/^```[\s\S]*?^```/gm, '');

export function citationsHeadingViolation(content) {
  return /^#{1,6}\s+Citations\s*$/m.test(stripFences(content))
    ? 'a `# Citations` heading is prohibited by this profile; use `sources:` with footnote markers'
    : null;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const isIsoDateTime = (v) => typeof v === 'string' && !Number.isNaN(Date.parse(v));
const isIsoDate = (v) =>
  typeof v === 'string' && ISO_DATE.test(v) && !Number.isNaN(Date.parse(v)) &&
  new Date(v).toISOString().slice(0, 10) === v;

function actorViolations(label, entry) {
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
    return [`\`${label}\` must be a mapping with \`by\` and \`at\``];
  }
  const out = [];
  if (!entry.by) out.push(`\`${label}.by\` is required`);
  if (!isIsoDateTime(entry.at)) out.push(`\`${label}.at\` is not ISO 8601`);
  return out;
}

export function isoViolations(data) {
  const out = [];
  if (data.generated !== undefined) out.push(...actorViolations('generated', data.generated));
  if (data.verified !== undefined) {
    if (!Array.isArray(data.verified)) {
      out.push('`verified` must be a list of { by, at } entries');
    } else {
      data.verified.forEach((e, i) => out.push(...actorViolations(`verified[${i}]`, e)));
    }
  }
  if (data.stale_after !== undefined && !isIsoDate(data.stale_after)) {
    out.push('`stale_after` is not an ISO date (YYYY-MM-DD)');
  }
  return out;
}

const FOOTNOTE_USE_RE = /\[\^([^\]]+)\]/g;

export function sourceViolations(data, content) {
  const sources = data.sources === undefined ? [] : data.sources;
  if (!Array.isArray(sources)) return ['`sources` must be a list'];

  const out = [];
  const ids = new Set();
  for (const s of sources) {
    if (s === null || typeof s !== 'object' || Array.isArray(s)) {
      out.push('each `sources` entry must be a mapping');
      continue;
    }
    if (!s.id) { out.push('a `sources` entry is missing `id`'); continue; }
    if (ids.has(s.id)) out.push(`duplicate source id \`${s.id}\``);
    ids.add(s.id);
    if (!s.resource) out.push(`source \`${s.id}\` is missing \`resource\``);
    if (!s.title) out.push(`source \`${s.id}\` is missing \`title\``);
  }

  // A definition line `[^id]: text` is not a use; only inline markers count.
  const body = stripFences(content).replace(/^\[\^[^\]]+\]:.*$/gm, '');
  const used = new Set(Array.from(body.matchAll(FOOTNOTE_USE_RE), (m) => m[1]));
  for (const u of used) if (!ids.has(u)) out.push(`footnote [^${u}] has no matching source id`);
  for (const id of ids) if (!used.has(id)) out.push(`source \`${id}\` is orphaned (no footnote marker)`);
  return out;
}

// Takes the whole supersession graph, because a cycle is not visible from a single edge.
// Runs whenever any page carries `superseded_by`, independent of the archival flag: a pointer
// that goes nowhere is a broken link either way.
export function supersessionViolations(pages) {
  const out = [];
  const keys = new Set(pages.map((p) => p.key));
  const edges = new Map();

  for (const { key, supersededBy } of pages) {
    if (supersededBy === undefined) continue;
    if (typeof supersededBy !== 'string') {
      out.push(`${key} -> \`superseded_by\` must be a topic/slug string`);
      continue;
    }
    if (supersededBy === key) { out.push(`${key} -> \`superseded_by\` points at itself`); continue; }
    if (!keys.has(supersededBy)) {
      out.push(`${key} -> \`superseded_by\` ${supersededBy} (no such page)`);
      continue;
    }
    edges.set(key, supersededBy);
  }

  // Walk each chain; a revisit within one walk is a cycle. Report each cycle once, keyed by
  // its lexicographically smallest member, so the message is stable across page order.
  const reported = new Set();
  for (const start of edges.keys()) {
    const seen = [];
    let node = start;
    while (node !== undefined && !seen.includes(node)) {
      seen.push(node);
      node = edges.get(node);
    }
    if (node === undefined) continue;
    const cycle = seen.slice(seen.indexOf(node));
    const id = [...cycle].sort()[0];
    if (reported.has(id)) continue;
    reported.add(id);
    out.push(`\`superseded_by\` cycle: ${[...cycle, node].join(' -> ')}`);
  }
  return out;
}
```

- [ ] **Step 4: Run unit tests to verify they pass**

Run: `node --test test/okf.test.mjs`
Expected: PASS.

- [ ] **Step 5: Write the failing e2e tests**

Append to `test/build-check.test.mjs`:
```javascript
test('check fails on a prohibited timestamp key', () => {
  expectCheckFails((dir) => writeFileSync(
    join(dir, 'wiki/demo/alpha.md'),
    '---\ntype: concept\ntitle: A\ndescription: d\ntimestamp: 2026-01-01T00:00:00Z\n---\n\nbody\n'
  ), /`timestamp` is prohibited by this profile/);
});

test('check fails on a prohibited Citations heading', () => {
  expectCheckFails((dir) => writeFileSync(
    join(dir, 'wiki/demo/alpha.md'),
    '---\ntype: concept\ntitle: A\ndescription: d\n---\n\nbody\n\n# Citations\n\n- x\n'
  ), /use `sources:`/);
});

test('check fails on an unresolved footnote marker', () => {
  expectCheckFails((dir) => writeFileSync(
    join(dir, 'wiki/demo/alpha.md'),
    '---\ntype: concept\ntitle: A\ndescription: d\n---\n\nclaim[^ghost]\n'
  ), /footnote \[\^ghost\]/);
});

test('check fails on a dangling superseded_by regardless of archival config', () => {
  expectCheckFails((dir) => writeFileSync(
    join(dir, 'wiki/demo/alpha.md'),
    '---\ntype: concept\ntitle: A\ndescription: d\nsuperseded_by: demo/ghost\n---\n\nbody\n'
  ), /no such page/);
});

test('check fails on a two-page superseded_by cycle', () => {
  expectCheckFails((dir) => {
    writeFileSync(join(dir, 'wiki/demo/alpha.md'),
      '---\ntype: concept\ntitle: A\ndescription: d\nsuperseded_by: demo/beta\n---\n\nbody\n');
    writeFileSync(join(dir, 'wiki/demo/beta.md'),
      '---\ntype: concept\ntitle: B\ndescription: d\nsuperseded_by: demo/alpha\n---\n\nbody\n');
  }, /cycle/);
});

test('a past stale_after is not a check failure', () => {
  const dir = sandbox();
  writeFileSync(join(dir, 'wiki/demo/alpha.md'),
    '---\ntype: concept\ntitle: A\ndescription: d\nstale_after: 2020-01-01\n---\n\nbody\n');
  const r = run(dir, '--check');
  clean(dir);
  assert.equal(r.status, 0, `staleness is advisory; stderr=${r.stderr}`);
});

test('check fails on a malformed stale_after', () => {
  expectCheckFails((dir) => writeFileSync(
    join(dir, 'wiki/demo/alpha.md'),
    '---\ntype: concept\ntitle: A\ndescription: d\nstale_after: 2027-13-99\n---\n\nbody\n'
  ), /not an ISO date/);
});

test('the legacy fixture fails check, and migrate makes it pass', () => {
  const dir = sandbox('legacy-v01');
  cpSync(join(ROOT, 'scripts'), join(dir, 'scripts'), { recursive: true });
  const before = run(dir, '--check');
  assert.equal(before.status, 1, 'the v0.1 fixture must be rejected');
  const mig = spawnSync('node', ['scripts/migrate.mjs'], { cwd: dir, encoding: 'utf8' });
  assert.equal(mig.status, 0, mig.stderr);
  const after = run(dir, '--check');
  clean(dir);
  assert.equal(after.status, 0, `migrated fixture must pass; stderr=${after.stderr}`);
});
```

- [ ] **Step 6: Run e2e tests to verify they fail**

Run: `node --test test/build-check.test.mjs`
Expected: FAIL. `validate` does not call the new validators yet.

- [ ] **Step 7: Wire the validators into validate()**

In `build.mjs`, add the five names to the `./lib/okf.mjs` import list. In `validate`, find this exact loop:
```javascript
  for (const c of concepts) {
    const v = typeViolation({ area: 'wiki', type: c.data.type, conceptTypes: CFG.conceptTypes });
    if (v) problems.push(`${c.key} -> ${v}`);
  }
```
and insert immediately after it:
```javascript
  // v0.2 profile: prohibited legacy forms, frontmatter shapes, source and footnote integrity.
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

- [ ] **Step 8: Run the full gate**

Run: `npm run check && npm test`
Expected: PASS both. `check` passes because Task 5 already migrated the shipped pages.

- [ ] **Step 9: Commit**

```bash
git add lib/okf.mjs build.mjs test/okf.test.mjs test/build-check.test.mjs
git commit -m "feat: enforce the okf v0.2 authoring profile"
```

---

### Task 7: Allow okf_version on the bundle root

**Files:**
- Create: `wiki/index.md`, `test/fixtures/minimal/wiki/index.md`
- Modify: `build.mjs` (the reserved-file loop), `test/build-check.test.mjs`

- [ ] **Step 1: Write the failing tests**

Append to `test/build-check.test.mjs`:
```javascript
test('the bundle-root index.md may declare only okf_version', () => {
  const dir = sandbox();
  writeFileSync(join(dir, 'wiki/index.md'), '---\nokf_version: "0.2"\n---\n\n# Demo wiki\n');
  const r = run(dir, '--check');
  clean(dir);
  assert.equal(r.status, 0, `expected pass; stderr=${r.stderr}`);
});

test('the bundle-root index.md rejects any other key', () => {
  expectCheckFails((dir) => writeFileSync(
    join(dir, 'wiki/index.md'), '---\nokf_version: "0.2"\ntitle: Nope\n---\n\n# Demo\n'
  ), /may declare only `okf_version`/);
});

test('a non-root index.md still rejects all frontmatter', () => {
  expectCheckFails((dir) => writeFileSync(
    join(dir, 'wiki/demo/index.md'), '---\nokf_version: "0.2"\n---\n\n# Demo\n'
  ), /must have no frontmatter/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/build-check.test.mjs`
Expected: FAIL. Every `index.md` with frontmatter is currently rejected.

- [ ] **Step 3: Add the exemption**

In `build.mjs`, find this exact loop:
```javascript
  for (const r of [...reserved, ...rawDocs.filter((d) => d.reserved)]) {
    if (isReservedPath(r.repoRel)) continue;
    if (hasFrontmatter(r.raw)) problems.push(`${r.repoRel} -> reserved file (${r.base}) must have no frontmatter`);
  }
```
and replace it with:
```javascript
  for (const r of [...reserved, ...rawDocs.filter((d) => d.reserved)]) {
    if (isReservedPath(r.repoRel)) continue;
    if (!hasFrontmatter(r.raw)) continue;
    // SPEC 12: the bundle-root index.md is the ONE place frontmatter is permitted, and only to
    // declare okf_version. Every other index.md, and any other key here, stays rejected.
    if (r.repoRel === 'wiki/index.md') {
      const keys = Object.keys(matter(r.raw).data);
      if (keys.length === 1 && keys[0] === 'okf_version') continue;
      problems.push(`${r.repoRel} -> bundle-root index.md may declare only \`okf_version\``);
      continue;
    }
    problems.push(`${r.repoRel} -> reserved file (${r.base}) must have no frontmatter`);
  }
```

`matter` is already imported in `build.mjs`, and `hasFrontmatter` is already defined there, so no new imports are needed.

- [ ] **Step 4: Create both bundle roots**

`wiki/index.md`:
```markdown
---
okf_version: "0.2"
---

# Wiki

Intro prose for this wiki. The topic listing below is generated.
```

`test/fixtures/minimal/wiki/index.md`:
```markdown
---
okf_version: "0.2"
---

# Fixture wiki
```

- [ ] **Step 5: Run the gate**

Run: `npm run check && npm test`
Expected: PASS both. The concept count is unchanged: `index.md` is reserved, not a concept.

- [ ] **Step 6: Make a failing build exit non-zero**

Added after the plan was written. `build.mjs` currently reports validation problems and then
renders anyway, because the exit is guarded by check mode:

```javascript
  const problems = validate(collected);
  if (problems.length) {
    console.error('OKF check problems:\n  ' + problems.join('\n  '));
    if (CHECK) process.exit(1);
  }
```

So `npm run build` prints "OKF check problems" and exits 0, which is why a broken bundle can be
published without anyone noticing. A gate that reports a failure and returns success is not a
gate. The same defect exists in the sibling lineage, so fix it here rather than porting it.

Write the failing test first. Append to `test/build-check.test.mjs`:

```javascript
test('build exits non-zero when validation fails, not just check', () => {
  const dir = sandbox();
  writeFileSync(join(dir, 'wiki/demo/alpha.md'),
    '---\ntype: concept\ntitle: A\ndescription: d\n---\n\nSee [x](./does-not-exist.md).\n');
  const r = run(dir);
  clean(dir);
  assert.equal(r.status, 1, 'a bundle that fails validation must fail the build');
  assert.match(r.stderr, /broken link/);
});

test('build does not write site/ when validation fails', () => {
  const dir = sandbox();
  writeFileSync(join(dir, 'wiki/demo/alpha.md'),
    '---\ntype: concept\ntitle: A\ndescription: d\n---\n\nSee [x](./does-not-exist.md).\n');
  run(dir);
  const wrote = existsSync(join(dir, 'site'));
  clean(dir);
  assert.equal(wrote, false, 'a failed build must not leave a stale or partial site/');
});
```

Run: `node --test test/build-check.test.mjs`
Expected: FAIL. The build currently exits 0 and writes `site/`.

Then replace the exact block quoted above with:

```javascript
  const problems = validate(collected);
  if (problems.length) {
    console.error('OKF check problems:\n  ' + problems.join('\n  '));
    // Non-zero in BOTH modes. Build mode used to fall through and render, so a bundle that
    // failed validation still published and still exited 0.
    process.exit(1);
  }
```

Run: `node --test test/build-check.test.mjs`
Expected: PASS.

- [ ] **Step 7: Run the gate**

Run: `npm run check && npm test && npm run build`
Expected: PASS all three. `npm run build` must still succeed on the real wiki, which is clean.

- [ ] **Step 8: Commit**

```bash
git add build.mjs wiki/index.md test/fixtures test/build-check.test.mjs
git commit -m "feat: declare okf_version on the bundle root"
```

---

### Task 8: Write the upgrade tool

**Files:**
- Create: `lib/upgrade.mjs`, `scripts/upgrade.mjs`, `test/upgrade.test.mjs`, `docs/profile-min.md`, `.okf-template-version`
- Modify: `package.json` (the `upgrade` script)

**Interfaces:**
- Produces: `ENGINE_PATHS`, `ENGINE_PKG_FIELDS`, `MARKER`, `patchPackageJson(clonePkg, templatePkg)`, `replaceMarkedBlock(text, block, marker)`, `configTransition(clonePkg)`.
- `--release` is **required** when fetching. There is no `latest` tag, so defaulting to one would fail every invocation.
- Fetch is staged and checksum-verified before anything is replaced, and `.okf-template-version` is written only after every step succeeds.

- [ ] **Step 1: Write the canonical normative block**

`docs/profile-min.md`. Its first line is the managed-comment line, so that line survives every replacement and the CI extraction stays stable.

```markdown
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
```

- [ ] **Step 2: Write the failing tests**

`test/upgrade.test.mjs`:
```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ENGINE_PATHS, patchPackageJson, replaceMarkedBlock, configTransition, MARKER,
} from '../lib/upgrade.mjs';

test('the engine manifest excludes every user-owned path', () => {
  for (const p of ['wiki', 'raw', 'topics.json', 'README.md', 'AGENTS.md', 'package.json']) {
    assert.ok(!ENGINE_PATHS.includes(p), `${p} must not be engine-owned`);
  }
  for (const p of ['lib', 'build.mjs', 'scripts', 'test', '.github']) {
    assert.ok(ENGINE_PATHS.includes(p), `${p} must be engine-owned`);
  }
});

test('patchPackageJson replaces engine fields and preserves clone fields', () => {
  const clone = {
    name: 'my-wiki', description: 'mine', version: '3.1.0',
    okf: { statusValues: ['wip'] },
    scripts: { check: 'old', mine: 'keep' },
    dependencies: { 'gray-matter': '4.0.2', chalk: '5.0.0' },
    engines: { node: '>=18' },
  };
  const tmpl = {
    name: 'okf-wiki-template', version: '2.0.0',
    scripts: { check: 'new', migrate: 'node scripts/migrate.mjs' },
    dependencies: { 'gray-matter': '4.0.3', marked: '18.0.5' },
    engines: { node: '>=20' },
  };
  const out = patchPackageJson(clone, tmpl);
  assert.equal(out.name, 'my-wiki');
  assert.equal(out.description, 'mine');
  assert.equal(out.version, '3.1.0');
  assert.deepEqual(out.okf, { statusValues: ['wip'] });
  assert.equal(out.scripts.check, 'new');
  assert.equal(out.scripts.migrate, 'node scripts/migrate.mjs');
  assert.equal(out.scripts.mine, 'keep', 'a clone script must survive');
  assert.equal(out.dependencies['gray-matter'], '4.0.3');
  assert.equal(out.dependencies.chalk, '5.0.0', 'a clone dependency must survive');
  assert.deepEqual(out.engines, { node: '>=20' });
});

test('replaceMarkedBlock swaps only the marked region and is idempotent', () => {
  const block = '<!-- managed -->\n## Rules\n\nNEW';
  const text = [
    '# My Wiki', '', 'My own prose.', '',
    `<!-- ${MARKER}:begin -->`, '<!-- managed -->', '## Rules', '', 'OLD', `<!-- ${MARKER}:end -->`,
    '', 'More of my prose.', '',
  ].join('\n');
  const once = replaceMarkedBlock(text, block, MARKER);
  assert.ok(once.includes('NEW'));
  assert.ok(!once.includes('OLD'));
  assert.ok(once.includes('My own prose.') && once.includes('More of my prose.'));
  assert.ok(once.includes('<!-- managed -->'), 'the managed comment must survive');
  assert.equal(replaceMarkedBlock(once, block, MARKER), once, 'replacement is idempotent');
});

test('replaceMarkedBlock throws when the markers are missing', () => {
  assert.throws(() => replaceMarkedBlock('no markers here', 'X', MARKER), /marker/);
});

test('configTransition writes the legacy block when the clone has none', () => {
  const t = configTransition({ name: 'w' });
  assert.equal(t.action, 'write-legacy');
  assert.deepEqual(t.okf.statusValues, ['stub', 'learning', 'researched', 'solid']);
  assert.deepEqual(t.okf.conceptTypes, ['concept', 'pattern', 'worked-example']);
  assert.equal(t.okf.needsWorkStatus, 'stub', 'rendering must not change');
  assert.match(t.message, /npm run migrate/);
});

test('configTransition never touches an existing block', () => {
  const t = configTransition({ okf: { statusValues: ['wip'] } });
  assert.equal(t.action, 'keep');
  assert.equal(t.okf, undefined);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `node --test test/upgrade.test.mjs`
Expected: FAIL with "Cannot find module '../lib/upgrade.mjs'".

- [ ] **Step 4: Write the pure helpers**

`lib/upgrade.mjs`:
```javascript
// Pure helpers for `npm run upgrade`. No I/O, no deps.
//
// Upgrades are a file sync from a pinned release, not a git merge: this template is used via
// GitHub's "Use this template", which produces a repository with unrelated history, so no
// template commit is ever an ancestor of a clone.
import {
  DEFAULT_CONCEPT_TYPES, DEFAULT_STATUS_VALUES, DEFAULT_RESERVED_FILES,
} from './config.mjs';

// ENGINE: replaced wholesale, because these files have exactly one owner.
export const ENGINE_PATHS = [
  'lib', 'build.mjs', 'scripts', 'test', '.github', 'assets',
  'docs/profile-min.md', 'docs/okf-profile.md', 'docs/upgrading.md', 'docs/composing.md',
];

// Files that must exist in a downloaded release for it to be considered intact.
export const REQUIRED_RELEASE_FILES = ['package.json', 'build.mjs', 'lib/okf.mjs', 'docs/profile-min.md'];

// package.json fields the template owns. Everything else in that file is the clone's.
export const ENGINE_PKG_FIELDS = ['scripts', 'dependencies'];

export const MARKER = 'okf-template:profile-min';

export function patchPackageJson(clonePkg, templatePkg) {
  const out = { ...clonePkg };
  for (const field of ENGINE_PKG_FIELDS) {
    if (templatePkg[field] === undefined) continue;
    // Template entries win per key; clone-only entries survive.
    out[field] = { ...(clonePkg[field] || {}), ...templatePkg[field] };
  }
  // `engines` is a whole-value replacement: a version floor is not a merge.
  if (templatePkg.engines !== undefined) out.engines = { ...templatePkg.engines };
  return out;
}

export function replaceMarkedBlock(text, block, marker = MARKER) {
  const begin = `<!-- ${marker}:begin -->`;
  const end = `<!-- ${marker}:end -->`;
  const i = text.indexOf(begin);
  const j = text.indexOf(end);
  if (i === -1 || j === -1 || j < i) {
    throw new Error(`missing ${marker} marker pair; add ${begin} and ${end} to the file first`);
  }
  const body = block.replace(/^\n+|\n+$/g, '');
  return `${text.slice(0, i + begin.length)}\n${body}\n${text.slice(j)}`;
}

// A clone with no `okf` block gets the LEGACY vocabulary written explicitly, so upgrading never
// silently changes which documents are valid or how cards render. Adopting the spec vocabulary
// is a separate, deliberate step the message names.
export function configTransition(clonePkg) {
  if (clonePkg.okf !== undefined) return { action: 'keep' };
  return {
    action: 'write-legacy',
    okf: {
      conceptTypes: [...DEFAULT_CONCEPT_TYPES],
      statusValues: [...DEFAULT_STATUS_VALUES],
      statusDefault: null,
      needsWorkStatus: 'stub',
      reservedFiles: [...DEFAULT_RESERVED_FILES],
      archival: false,
      federation: false,
    },
    message:
      'wrote the legacy `okf` block to preserve current behavior. To adopt the OKF v0.2 ' +
      'vocabulary run: npm run migrate -- --status-map ' +
      'stub=draft,learning=draft,researched=stable,solid=stable ' +
      'then set statusValues to draft/stable/deprecated and needsWorkStatus to draft.',
  };
}
```

- [ ] **Step 5: Run unit tests to verify they pass**

Run: `node --test test/upgrade.test.mjs`
Expected: PASS, 6 tests.

- [ ] **Step 6: Write the CLI wrapper**

`scripts/upgrade.mjs`. Staged, verified, and atomic: nothing in the clone is replaced until the download is verified and complete.

```javascript
#!/usr/bin/env node
// Syncs ENGINE files from a pinned template release.
//
// Usage:
//   npm run upgrade -- --release v2.1.0 [--dry-run]
//   npm run upgrade -- --from ../okf-wiki-template   (an already-present tree; used by tests)
//
// There is deliberately no default release: `latest` is not a tag, and guessing one would
// either fail or silently pull an unintended version.
import {
  readFileSync, writeFileSync, cpSync, existsSync, rmSync, mkdtempSync, renameSync, mkdirSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  ENGINE_PATHS, REQUIRED_RELEASE_FILES, patchPackageJson, replaceMarkedBlock, configTransition, MARKER,
} from '../lib/upgrade.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = (n) => { const i = argv.indexOf(n); return i === -1 ? null : argv[i + 1]; };
const DRY = argv.includes('--dry-run');
const REPO = 'https://github.com/het-sheth/okf-wiki-template';

const die = (msg) => { console.error(`upgrade: ${msg}`); process.exit(1); };
const log = (m) => console.log(m);

// --- 1. stage the release ---------------------------------------------------
function stageRelease(tag) {
  const stage = mkdtempSync(join(tmpdir(), 'okf-stage-'));
  const tarPath = join(stage, 'release.tar.gz');
  const base = `${REPO}/releases/download/${tag}`;

  const get = (url, dest) =>
    spawnSync('curl', ['-fsSL', '-o', dest, url], { encoding: 'utf8' });

  if (get(`${base}/okf-wiki-template-${tag}.tar.gz`, tarPath).status !== 0) {
    die(`could not download the ${tag} tarball from ${base}`);
  }
  const sumsPath = join(stage, 'SHA256SUMS');
  if (get(`${base}/SHA256SUMS`, sumsPath).status !== 0) {
    die(`${tag} has no published SHA256SUMS, so the download cannot be verified`);
  }

  const actual = createHash('sha256').update(readFileSync(tarPath)).digest('hex');
  const expected = readFileSync(sumsPath, 'utf8').split(/\s+/)[0];
  if (actual !== expected) die(`checksum mismatch for ${tag}: expected ${expected}, got ${actual}`);
  log(`verified ${tag} (sha256 ${actual.slice(0, 12)})`);

  const out = join(stage, 'tree');
  mkdirSync(out);
  const x = spawnSync('tar', ['-xzf', tarPath, '-C', out, '--strip-components=1'], { encoding: 'utf8' });
  if (x.status !== 0) die(`could not extract ${tag}: ${x.stderr}`);
  return out;
}

const from = flag('--from');
const tag = flag('--release');
if (!from && !tag) die('pass --release <tag> (or --from <dir>). There is no default release.');
const src = from ? from : stageRelease(tag);

// --- 2. validate the staged tree before touching anything ------------------
for (const f of REQUIRED_RELEASE_FILES) {
  if (!existsSync(join(src, f))) die(`the release is incomplete: ${f} is missing. Nothing was changed.`);
}
const tmplPkg = JSON.parse(readFileSync(join(src, 'package.json'), 'utf8'));

if (DRY) {
  log('dry run. Would replace:');
  for (const p of ENGINE_PATHS) if (existsSync(join(src, p))) log(`  ${p}`);
  log('  package.json (scripts, dependencies, engines)');
  log('  the AGENTS.md marked block');
  log(`\nnot touched: wiki/ raw/ topics.json README.md, and your AGENTS.md prose`);
  process.exit(0);
}

// --- 3. replace engine paths, staging each swap ----------------------------
for (const p of ENGINE_PATHS) {
  const s = join(src, p);
  if (!existsSync(s)) continue;
  const target = join(ROOT, p);
  const staged = `${target}.upgrade-new`;
  rmSync(staged, { recursive: true, force: true });
  cpSync(s, staged, { recursive: true });
  rmSync(target, { recursive: true, force: true });
  renameSync(staged, target);
  log(`replaced ${p}`);
}

// --- 4. package.json and the config transition -----------------------------
const clonePkgPath = join(ROOT, 'package.json');
const clonePkg = JSON.parse(readFileSync(clonePkgPath, 'utf8'));
let nextPkg = patchPackageJson(clonePkg, tmplPkg);
const t = configTransition(clonePkg);
if (t.action === 'write-legacy') { nextPkg = { ...nextPkg, okf: t.okf }; log(`config: ${t.message}`); }
else log('config: kept your existing `okf` block');
writeFileSync(clonePkgPath, `${JSON.stringify(nextPkg, null, 2)}\n`);
log('patched package.json (scripts, dependencies, engines)');

// --- 5. the AGENTS.md normative block --------------------------------------
const agentsPath = join(ROOT, 'AGENTS.md');
try {
  const canonical = readFileSync(join(ROOT, 'docs/profile-min.md'), 'utf8');
  writeFileSync(agentsPath, replaceMarkedBlock(readFileSync(agentsPath, 'utf8'), canonical, MARKER));
  log('replaced the AGENTS.md normative block; your prose was left alone');
} catch (e) {
  log(`SKIPPED AGENTS.md: ${e.message}`);
}

// --- 6. lockfile is derived, never merged ----------------------------------
const install = spawnSync('npm', ['install', '--silent'], { cwd: ROOT, encoding: 'utf8' });
if (install.status !== 0) {
  console.error(install.stderr);
  die('npm install failed. Engine files are updated but the lockfile is not, and the recorded ' +
      'template version was NOT advanced. Fix the install, then re-run.');
}
log('regenerated package-lock.json');

// --- 7. record the release, last, only on success --------------------------
writeFileSync(join(ROOT, '.okf-template-version'), `${tmplPkg.version || tag}\n`);
log('\nnot touched: wiki/ raw/ topics.json README.md, and your AGENTS.md prose');
log(`now on template ${tmplPkg.version || tag}. Run: npm run check`);
```

- [ ] **Step 7: Register the script and seed the version file**

In `package.json` `scripts`, add:
```json
    "upgrade": "node scripts/upgrade.mjs",
```
Create `.okf-template-version` containing `2.0.0`.

- [ ] **Step 8: Add the end-to-end upgrade test**

Append to `test/upgrade.test.mjs`:
```javascript
import { spawnSync } from 'node:child_process';
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test('upgrade replaces engine files and preserves everything of the clone', () => {
  const dir = mkdtempSync(join(tmpdir(), 'okf-up-'));
  cpSync(join(ROOT, 'test/fixtures/minimal'), dir, { recursive: true });
  for (const p of ['build.mjs', 'lib', 'scripts', 'assets']) {
    cpSync(join(ROOT, p), join(dir, p), { recursive: true });
  }
  cpSync(join(ROOT, 'docs/profile-min.md'), join(dir, 'docs/profile-min.md'), { recursive: true });
  symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'), 'dir');

  writeFileSync(join(dir, 'wiki/demo/mine.md'),
    '---\ntype: concept\ntitle: Mine\ndescription: d\n---\n\nMy page.\n');
  writeFileSync(join(dir, 'AGENTS.md'),
    '# demo wiki\n\nMy own conventions.\n\n' +
    '<!-- okf-template:profile-min:begin -->\nOLD\n<!-- okf-template:profile-min:end -->\n\n' +
    'More of mine.\n');
  writeFileSync(join(dir, 'lib', 'okf.mjs'), '// stale\n');

  const r = spawnSync('node', ['scripts/upgrade.mjs', '--from', ROOT], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);

  assert.ok(readFileSync(join(dir, 'lib/okf.mjs'), 'utf8').includes('typeViolation'),
    'the stale engine file must be replaced');
  assert.ok(readFileSync(join(dir, 'wiki/demo/mine.md'), 'utf8').includes('My page.'),
    'user content must survive');
  const agents = readFileSync(join(dir, 'AGENTS.md'), 'utf8');
  assert.ok(agents.includes('My own conventions.') && agents.includes('More of mine.'),
    'user prose must survive');
  assert.ok(!agents.includes('OLD'), 'the normative block must be replaced');
  assert.ok(agents.includes('is prohibited by this profile'), 'new rules must be present');

  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  assert.equal(pkg.name, 'fixture-minimal', 'the clone name must survive');
  assert.deepEqual(pkg.okf.statusValues, ['stub', 'learning', 'researched', 'solid'],
    'a clone with no block gets the legacy vocabulary, not the spec one');

  const check = spawnSync('node', ['build.mjs', '--check'], { cwd: dir, encoding: 'utf8' });
  assert.equal(check.status, 0, `upgraded clone must pass check; stderr=${check.stderr}`);
  rmSync(dir, { recursive: true, force: true });
});

test('upgrade refuses to run without a release and changes nothing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'okf-up2-'));
  cpSync(join(ROOT, 'test/fixtures/minimal'), dir, { recursive: true });
  cpSync(join(ROOT, 'scripts'), join(dir, 'scripts'), { recursive: true });
  cpSync(join(ROOT, 'lib'), join(dir, 'lib'), { recursive: true });
  const before = readFileSync(join(dir, 'package.json'), 'utf8');
  const r = spawnSync('node', ['scripts/upgrade.mjs'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /no default release/);
  assert.equal(readFileSync(join(dir, 'package.json'), 'utf8'), before);
  rmSync(dir, { recursive: true, force: true });
});
```

- [ ] **Step 9: Run the gate**

Run: `npm run check && npm test`
Expected: PASS both.

- [ ] **Step 10: Commit**

```bash
git add lib/upgrade.mjs scripts/upgrade.mjs docs/profile-min.md test/upgrade.test.mjs package.json .okf-template-version
git commit -m "feat: add verified upgrade tool"
```

---

### Task 9: Restructure AGENTS.md and write the docs

**Files:**
- Modify: `AGENTS.md`, `README.md`
- Create: `docs/okf-profile.md`, `docs/upgrading.md`, `docs/composing.md`

- [ ] **Step 1: Restructure AGENTS.md**

Replace the whole file. Everything outside the markers is clone-owned example prose.

```markdown
# OKF Wiki: schema and conventions

A Markdown-canonical knowledge base. Write pages under `wiki/<topic>/`, then run `npm run check`.

<!-- okf-template:profile-min:begin -->
<!-- Managed by `npm run upgrade`. Edit docs/profile-min.md in the template, not here. -->
## OKF profile (normative)

... paste the rest of docs/profile-min.md here, verbatim, starting at the line after its
managed-comment first line ...
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
```

The block between the markers must be byte-identical to `docs/profile-min.md`, including its
managed-comment first line, because `replaceMarkedBlock` writes that whole file into that region.

- [ ] **Step 2: Verify the block matches its canonical source**

Run:
```bash
awk '/profile-min:begin/{f=1;next} /profile-min:end/{f=0} f' AGENTS.md > /tmp/block
diff /tmp/block docs/profile-min.md && echo BLOCK_OK
```
Expected: `BLOCK_OK`. This extraction removes only the marker lines, so it stays correct after
an upgrade rewrites the region.

- [ ] **Step 3: Write docs/okf-profile.md**

Full reference. Every vocabulary-dependent passage must name the config key that changes it, so the document is never wrong for a clone with its own vocabulary. Required sections:

- **Frontmatter fields**: `type` (required), `title`, `description`, `tags`, `resource`, `status`, `generated`, `verified`, `stale_after`, `sources`, `superseded_by`, `legacy_timestamp`. For each: whether the profile requires it, its shape, and one example.
- **A note on vocabularies**: state that the examples use the default configuration, that `type` values come from `okf.conceptTypes` and `status` values from `okf.statusValues`, so a wiki configured for another subject shows different words.
- **Every `okf.*` key**: `conceptTypes`, `statusValues`, `statusDefault`, `needsWorkStatus`, `reservedFiles`, `archival`, `federation`, `title`. Default, purpose, and effect. For `needsWorkStatus`, explain that it controls the muted card and is separate from `statusDefault` because the two answer different questions.
- **Prohibited forms**: `timestamp` and `# Citations`, with replacements and the reason (v0.2 renames), plus the note that this lint is stricter than OKF and a rejected bundle may still be valid OKF.
- **Sources and footnotes**: worked example of a page with two sources and two markers, showing that a declared id must be referenced and a referenced id must be declared.
- **Supersession**: `superseded_by` is validated whenever present, including cycles, independent of `okf.archival`.
- **Links**: Markdown links, within-wiki wikilinks, cross-wiki wikilinks, and the federation flag.
- **Staleness**: `check` rejects a malformed `stale_after`; a past date is advisory.
- **Styling a custom status**: the emitted class is always `needs-work`, so `assets/wiki.css` needs no change when the vocabulary changes.

- [ ] **Step 4: Write docs/upgrading.md**

Must state:

- Upgrades are a file sync, not a git merge, and why: GitHub's "Use this template" creates unrelated history, so no template commit is ever an ancestor. Do not attempt `git merge template/main`.
- `npm run upgrade -- --release v2.1.0`. `--release` is required; there is no default. `--dry-run` prints the plan and writes nothing.
- The release is downloaded to a staging directory and verified against the published `SHA256SUMS` before anything is replaced. An incomplete or unverified release aborts with the clone untouched.
- The ownership table: ENGINE replaced, USER never touched, `package.json` fields patched, `AGENTS.md` marked block replaced.
- A clone with no `okf` block gets the legacy vocabulary written explicitly, plus the exact `npm run migrate -- --status-map ...` command to adopt the spec one.
- `package-lock.json` is regenerated, not merged. If `npm install` fails, the recorded template version is deliberately not advanced, so re-running is safe.
- A missing marker pair in `AGENTS.md` makes the tool skip that file and report it, rather than guess.
- Recovery: the tool writes in place with no backup, so commit or stash first.

- [ ] **Step 5: Write docs/composing.md**

Must state:

- The three-way split: `example-agent-rules` is the behavior layer loaded every session and kept short; this template is a subject knowledge base loaded on demand; `example-second-brain` is one person's context layer with a journal and capture workflow.
- Where a thing goes: a standing instruction to the rulebook, a personal daily note to the second brain, durable subject knowledge here.
- The wiring: one line in `_machine.md`'s Paths section naming this clone and saying to navigate by reading its `AGENTS.md` first, never by grepping the tree.
- That this template deliberately ships no journal or daily-note templates, because those are the second brain's job.

- [ ] **Step 6: Update the README**

Add three things:

1. A **Related** section naming `example-agent-rules` and `example-second-brain`, one line each, pointing at `docs/composing.md`.
2. A **compatibility table**: template version, OKF spec version, node floor. First row `2.0.0` / `0.2` / `>=20`.
3. An **Upgrading** section with one `npm run upgrade -- --release <tag>` example and the sentence that a git merge is not the upgrade path, pointing at `docs/upgrading.md`.

Also correct the "Use this template" quickstart to mention `npm run check` rather than only `npm install`, and drop the stale instruction to rename the README title if it no longer matches.

- [ ] **Step 7: Verify pointer targets exist**

Run: `for f in $(grep -ohE 'docs/[a-z-]+\.md' AGENTS.md README.md | sort -u); do test -f "$f" || echo "MISSING $f"; done`
Expected: no output.

- [ ] **Step 8: Run the gate**

Run: `npm run check && npm test`
Expected: PASS both.

- [ ] **Step 9: Commit**

```bash
git add AGENTS.md README.md docs
git commit -m "docs: split normative profile from clone prose"
```

---

### Task 10: CI, CONTRIBUTING, CHANGELOG, and the v2.0.0 tag

**Files:**
- Create: `.github/workflows/ci.yml`, `CONTRIBUTING.md`, `CHANGELOG.md`
- Modify: `package.json` (`version`)

- [ ] **Step 1: Write the CI workflow**

`.github/workflows/ci.yml`:
```yaml
name: ci
on: [push, pull_request]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }

      # A real install from the lockfile, in the checked-out tree. `npm test` runs the migration
      # idempotence and upgrade simulation suites, so those are covered here too.
      - run: npm ci
      - run: npm run check
      - run: npm test
      - run: npm run build

      - name: normative block matches its canonical source
        run: |
          awk '/profile-min:begin/{f=1;next} /profile-min:end/{f=0} f' AGENTS.md > /tmp/block
          diff /tmp/block docs/profile-min.md
          test "$(wc -l < docs/profile-min.md)" -le 25

      - name: pointer targets exist
        run: |
          for f in $(grep -ohE 'docs/[a-z-]+\.md' AGENTS.md README.md | sort -u); do
            test -f "$f" || { echo "missing pointer target: $f"; exit 1; }
          done

      - name: site is not tracked
        run: |
          if git ls-files --error-unmatch site >/dev/null 2>&1; then
            echo "site/ must not be tracked"; exit 1
          fi

  ingest:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v5
      - run: uv run --extra dev pytest -v
        working-directory: ingest
```

- [ ] **Step 2: Verify the checkable steps locally**

Run:
```bash
awk '/profile-min:begin/{f=1;next} /profile-min:end/{f=0} f' AGENTS.md > /tmp/block && diff /tmp/block docs/profile-min.md && test "$(wc -l < docs/profile-min.md)" -le 25 && echo BLOCK_OK
git ls-files --error-unmatch site >/dev/null 2>&1 && echo "TRACKED (bad)" || echo SITE_OK
```
Expected: `BLOCK_OK` and `SITE_OK`.

- [ ] **Step 3: Verify a clean clone of the committed tree**

Run:
```bash
rm -rf /tmp/cleanclone && mkdir /tmp/cleanclone
git archive HEAD | tar -x -C /tmp/cleanclone
cd /tmp/cleanclone && npm ci && npm run check && npm test; cd - >/dev/null
rm -rf /tmp/cleanclone
```
Expected: all pass. `git archive HEAD` is used rather than `git clone file://$PWD` because the latter clones committed `HEAD` without the uncommitted tree, and because this must exercise a real `npm ci` rather than a symlinked `node_modules`. Commit the current task's work before running it.

- [ ] **Step 4: Write CONTRIBUTING.md**

Must cover:

- The gate: `npm run check && npm test` before any PR, plus `cd ingest && uv run --extra dev pytest` when ingest changed. Exit code is the only signal.
- Where a change goes: profile rules in `lib/okf.mjs` and `docs/profile-min.md`, config in `lib/config.mjs`, rendering in `build.mjs`. `lib/*.mjs` stays pure; I/O lives in `build.mjs` and `scripts/`.
- **Every commit must leave `npm run check` green.** A new prohibition needs its migration path and any content fix in the same commit, or the change is not shippable.
- `raw/` is immutable. No script may write to it.
- The versioning rules: the scaffold contract is the accepted-document set, the ENGINE manifest, the `okf` config schema, and whether a migration is required. MAJOR shrinks the accepted set or changes the manifest or schema incompatibly or needs a migration; MINOR adds an optional key, a script, or a check that only fires on newly rejected syntax; PATCH changes no contract.
- Releases must publish a tarball plus `SHA256SUMS`, because `npm run upgrade` refuses an unverifiable release.
- `AGENTS.md` outside the markers belongs to the clone; the template must never write there.

- [ ] **Step 5: Write CHANGELOG.md**

```markdown
# Changelog

All notable changes to this template. Format loosely follows Keep a Changelog.

| Template | OKF spec | Node |
|---|---|---|
| 2.0.0 | 0.2 | >=20 |
| 1.x (untagged) | 0.1 | >=20 |

## 2.0.0

MAJOR: the accepted-document set shrinks and a migration is required.

### Added
- `lib/config.mjs`: configurable `conceptTypes`, `statusValues`, `statusDefault`,
  `needsWorkStatus`, `reservedFiles`, `archival`, alongside the existing `federation` and `title`.
- `npm run migrate`: v0.1 to v0.2 content migration. Idempotent, `wiki/` only, never invents
  provenance.
- `npm run upgrade -- --release <tag>`: checksum-verified engine file sync. Not a git merge.
- Validation for `generated`, `verified`, `stale_after`, `sources` ids and footnote markers, and
  `superseded_by` including cycles of any length.
- `okf_version` on the bundle-root `wiki/index.md`.
- CI, CONTRIBUTING, this changelog, and `test/fixtures/`.
- `docs/profile-min.md`, `docs/okf-profile.md`, `docs/upgrading.md`, `docs/composing.md`.

### Changed
- `AGENTS.md` is clone-owned except the marked normative block.
- Concept types come from config. The muted card class is now a stable `needs-work` rather than
  the status word, so `assets/wiki.css` no longer depends on the vocabulary.
- Engine tests read `test/fixtures/`, so clone content cannot break them.
- Ingest emits v0.2 frontmatter with a referenced source, and falls back to the legacy default
  status when a wiki root has no `package.json`.

### Removed
- `timestamp:` is prohibited. Use `generated.at`, or `legacy_timestamp` for a value with no known
  author.
- The `# Citations` heading is prohibited. Use `sources:` with footnote markers.

### Upgrading
Run `npm run upgrade -- --release v2.0.0`, then `npm run migrate`, then `npm run check`. See
`docs/upgrading.md`. A clone with no `okf` block keeps the legacy vocabulary; adopting the v0.2
vocabulary is a separate, deliberate step.
```

- [ ] **Step 6: Set the version and run the full gate**

Set `"version": "2.0.0"` in `package.json`, then run:
`npm run check && npm test && npm run build && (cd ingest && uv run --extra dev pytest -q)`
Expected: all pass.

- [ ] **Step 7: Commit, then tag after the PR merges**

```bash
git add .github CONTRIBUTING.md CHANGELOG.md package.json
git commit -m "chore: add ci, contributing, and changelog"
```

Push the branch and open a PR. Do not push to `main`. After the merge, tag `v2.0.0` and publish a release with a tarball and `SHA256SUMS`, since `npm run upgrade` refuses a release it cannot verify.

---

## Self-review

**Spec coverage.** Upgrade tool and ownership to Task 8; test decoupling to Task 1; the ingest-as-engine-tool note to Task 4 and `docs/upgrading.md` in Task 9; the marked `AGENTS.md` block to Tasks 8 and 9; cross-repo seams to Task 9, with the two sibling-repo edits in the follow-on plan; profile items to Tasks 3, 6, and 7; the config transition to Task 8; mechanical-only validation to Task 6; archival decoupling to Tasks 2 and 6; migration to Task 5; the shipped-topic migration to Task 5 Step 9; the parametric profile doc to Task 9; SemVer, two version numbers, releases, and CI to Task 10. The deferred conformance corpus stays deferred per the spec's "Rejected approaches".

**Deviations from the spec, deliberate.** Two, both from review findings. First, the spec says ingest should fail when no status is resolvable; Task 4 makes a missing `package.json` fall back to the legacy default instead, because the integration tests and any bare `--wiki-root` legitimately have none. `build_stub` still raises on an empty status, so the guarantee that matters survives. Second, the spec described `superseded_by` validation per page; Task 6 makes it a graph function, because cycle detection is impossible from a single edge. `docs/okf-profile.md` must state both.

**Green-at-every-commit.** Task 4 precedes Task 6 so no tool emits rejected output; Task 5 precedes Task 6 so no shipped content is rejected. Every task ends with `npm run check && npm test`.

**Type consistency.** `resolveOkfConfig` returns the same eight keys everywhere. `typeViolation` takes `conceptTypes` from Task 3 on. `migrateBody(content, existingIds)` keeps that signature in `scripts/migrate.mjs`. `supersessionViolations(pages)` takes `[{key, supersededBy}]` in Task 6 and in the sibling plan. `MARKER` is defined once in `lib/upgrade.mjs`. Fixture names (`demo`, `alpha`, `beta`) are consistent from Task 1.

**No line-number edit targets.** Every modification quotes the exact current text to replace, so earlier tasks shifting line numbers cannot misdirect a later one.
