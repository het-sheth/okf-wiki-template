# okf-wiki-template v2.0.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `okf-wiki-template` from OKF v0.1 to v0.2, make its vocabularies configurable so it works as a knowledge base for any subject, and give it a real upgrade path plus a first tagged release.

**Architecture:** All profile policy moves into a pure config resolver (`lib/config.mjs`) read from `package.json`'s existing `okf` block, so `build.mjs` stops hardcoding vocabularies. Two new scripts handle transitions: `migrate` rewrites v0.1 content to v0.2 without inventing provenance, and `upgrade` syncs engine files from a pinned template release (a file sync, not a git merge, because GitHub's "Use this template" produces unrelated histories). Engine tests move to self-contained fixtures so a clone's own content can never break them.

**Tech Stack:** Node 20+, ESM, `node --test`, `gray-matter` 4.0.3, `marked` 18.0.5, Python 3 with `uv` for the optional ingest pipeline.

**Spec:** `docs/superpowers/specs/2026-08-20-okf-v02-template-design.md`

## Global Constraints

- Node `>=20`. ESM only (`"type": "module"`). No new npm dependencies.
- `lib/*.mjs` stays pure: no I/O, no deps, so tests can call it directly. File I/O lives in `build.mjs` and `scripts/*.mjs`.
- `npm run check` is a **profile lint**, not an OKF validator. Every new error message says the key or form is "prohibited by this profile" and names the replacement. It never says a document is invalid OKF.
- Build and export paths preserve unknown frontmatter keys rather than dropping them.
- Every `okf.*` code default reproduces today's behavior, so a clone that never edits config sees no change.
- The `okf` block in `package.json` already carries `federation` and `title` (`build.mjs:26`, `build.mjs:32`). The resolver must preserve both.
- Legacy status vocabulary: `stub | learning | researched | solid`. Spec vocabulary: `draft | stable | deprecated`.
- Default status map: `stub -> draft`, `learning -> draft`, `researched -> stable`, `solid -> stable`.
- Commits: Conventional Commits, imperative subject, 50 characters or fewer, no AI attribution lines.
- No em dashes in code, comments, strings, docs, or commit messages.

## File Structure

| File | Responsibility |
|---|---|
| `lib/config.mjs` | new. Pure resolver for the `okf` block; every key defaulted. |
| `lib/okf.mjs` | modified. Add prohibition and shape validators; make `typeViolation` take a vocabulary. |
| `lib/migrate.mjs` | new. Pure v0.1 to v0.2 transforms (frontmatter and body). No I/O. |
| `lib/upgrade.mjs` | new. Pure helpers: package.json field patch, marked-block replacement, config transition. |
| `build.mjs` | modified. Load config; use it for types, status card class, and the new checks. |
| `scripts/migrate.mjs` | new. CLI wrapper: walk `wiki/` and `raw/`, apply `lib/migrate.mjs`, report. |
| `scripts/upgrade.mjs` | new. CLI wrapper: fetch release, replace ENGINE files, patch, report. |
| `test/fixtures/<case>/` | new. Self-contained bundles owned by the engine. |
| `test/config.test.mjs` | new. Unit tests for the resolver. |
| `test/migrate.test.mjs` | new. Unit plus idempotence tests. |
| `test/upgrade.test.mjs` | new. Unit tests for the pure helpers. |
| `AGENTS.md` | modified. Normative block inside markers; prose outside stays clone-owned. |
| `docs/okf-profile.md` | new. Full field tables, config keys, examples, all parametric. |
| `docs/upgrading.md` | new. How `npm run upgrade` works and what it will not touch. |
| `docs/composing.md` | new. How this template relates to the rulebook and the second brain. |

---

### Task 1: Decouple engine tests from user content

`test/build-check.test.mjs:55` copies live `wiki/` into its sandbox and `:99` asserts `check ok: 2 concepts`. Since `upgrade` replaces engine tests wholesale, any clone that wrote its own pages would fail `npm test` after upgrading. Fixtures fix that.

**Files:**
- Create: `test/fixtures/minimal/` (a two-concept bundle), `test/fixtures/legacy-v01/` (a v0.1 bundle for later tasks)
- Modify: `test/build-check.test.mjs:53-60` (the `sandbox` helper), `:94-100`

**Interfaces:**
- Produces: `sandbox(fixture = 'minimal')` returning a temp dir path. Later tasks call `sandbox('legacy-v01')`.

- [ ] **Step 1: Create the minimal fixture bundle**

```bash
mkdir -p test/fixtures/minimal/wiki/demo test/fixtures/minimal/raw
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

`test/fixtures/minimal/raw/.gitkeep`: empty file.

- [ ] **Step 2: Point the sandbox helper at fixtures**

Replace `test/build-check.test.mjs:53-60` with:

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

- [ ] **Step 3: Update the happy-path assertion and every topic path**

In `test/build-check.test.mjs`, replace `getting-started` with `demo`, `welcome` with `alpha`, and `writing-concepts` with `beta` throughout. Line 99 becomes:

```javascript
  assert.match(r.stdout, /check ok: 2 concepts, 0 problems/);
```

The count is unchanged because the fixture also has two concepts, but it now describes fixture content the engine owns.

- [ ] **Step 4: Run the suite to verify it passes against fixtures**

Run: `npm test`
Expected: PASS. All e2e tests now read `test/fixtures/minimal/`, not `wiki/`.

- [ ] **Step 5: Prove the decoupling**

Run: `rm -rf /tmp/decouple && cp -r . /tmp/decouple && rm -rf /tmp/decouple/wiki/getting-started && cd /tmp/decouple && npm test`
Expected: PASS. Deleting the shipped topic no longer breaks engine tests. Then `rm -rf /tmp/decouple`.

- [ ] **Step 6: Commit**

```bash
git add test/fixtures test/build-check.test.mjs
git commit -m "test: move engine tests onto owned fixtures"
```

---

### Task 2: Add the config resolver

**Files:**
- Create: `lib/config.mjs`, `test/config.test.mjs`
- Reference: `example-second-brain/lib/config.mjs` (the shape being backported)

**Interfaces:**
- Produces: `resolveOkfConfig(okf?)` returning
  `{ conceptTypes: string[], statusValues: string[], statusDefault: string|null, reservedFiles: string[], archival: boolean, federation: boolean, title: string|null }`.
  Throws `Error` on malformed input. Later tasks import this.
- Produces: `DEFAULT_CONCEPT_TYPES`, `DEFAULT_STATUS_VALUES`, `DEFAULT_RESERVED_FILES`, `SPEC_STATUS_VALUES`.

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
  assert.equal(c.federation, false);
  assert.equal(c.title, null);
});

test('legacy defaults are the template current vocabulary, not the spec one', () => {
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

test('statusDefault resolves to stable when the vocabulary has it, else null', () => {
  assert.equal(resolveOkfConfig({ statusValues: SPEC_STATUS_VALUES }).statusDefault, 'stable');
  assert.equal(resolveOkfConfig({ statusValues: ['wip', 'done'] }).statusDefault, null);
});

test('an explicit statusDefault must be in the vocabulary', () => {
  assert.equal(resolveOkfConfig({ statusValues: ['wip', 'done'], statusDefault: 'wip' }).statusDefault, 'wip');
  assert.throws(() => resolveOkfConfig({ statusValues: ['wip'], statusDefault: 'nope' }), /statusDefault/);
});

test('archival is an explicit boolean, not derived from the vocabulary', () => {
  assert.equal(resolveOkfConfig({ statusValues: ['wip', 'done'], archival: true }).archival, true);
  assert.equal(resolveOkfConfig({ statusValues: SPEC_STATUS_VALUES }).archival, false);
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
// Pure resolver for package.json's `okf` block. Every key has a default matching
// v1 behavior, so a repo with no `okf` key sees zero change. No I/O, no deps.

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

export function resolveOkfConfig(okf = {}) {
  if (okf === null || typeof okf !== 'object' || Array.isArray(okf)) {
    throw new Error('package.json `okf` must be an object');
  }
  const conceptTypes = arrayKey(okf, 'conceptTypes', DEFAULT_CONCEPT_TYPES);
  const statusValues = arrayKey(okf, 'statusValues', DEFAULT_STATUS_VALUES);
  const reservedFiles = arrayKey(okf, 'reservedFiles', DEFAULT_RESERVED_FILES);

  // What an ABSENT `status:` means. Explicit wins and must be in the vocabulary. When omitted:
  // 'stable' if the vocabulary has it (the v0.2 rule), else null, because a custom vocabulary
  // without 'stable' has no principled silent default.
  let statusDefault;
  if (okf.statusDefault === undefined) {
    statusDefault = statusValues.includes('stable') ? 'stable' : null;
  } else if (okf.statusDefault === null) {
    statusDefault = null;
  } else if (typeof okf.statusDefault === 'string' && statusValues.includes(okf.statusDefault)) {
    statusDefault = okf.statusDefault;
  } else {
    throw new Error('`okf.statusDefault` must be one of `okf.statusValues` or null');
  }

  // Archival is explicit, never inferred from whether the vocabulary happens to contain
  // 'deprecated'. `superseded_by` is validated whenever present regardless of this flag.
  const archival = boolKey(okf, 'archival', false);
  const federation = boolKey(okf, 'federation', false);

  const title = okf.title === undefined ? null : okf.title;
  if (title !== null && typeof title !== 'string') throw new Error('`okf.title` must be a string');

  return { conceptTypes, statusValues, statusDefault, reservedFiles, archival, federation, title };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/config.test.mjs`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/config.mjs test/config.test.mjs
git commit -m "feat: add okf config resolver"
```

---

### Task 3: Make build.mjs read the config

Removes the two hardcoded vocabularies: the concept types in `typeViolation` and the `status === 'stub'` card class at `build.mjs:311`.

**Files:**
- Modify: `lib/okf.mjs:27-36` (`typeViolation`), `build.mjs:22-32` (config load), `build.mjs:311` (card class), `build.mjs:214-222` (type checks)
- Modify: `test/okf.test.mjs` (typeViolation cases)

**Interfaces:**
- Consumes: `resolveOkfConfig` from Task 2.
- Produces: `typeViolation({ area, type, conceptTypes })`. `conceptTypes` is optional and defaults to `WIKI_CONCEPT_TYPES`, so existing callers keep working.
- Produces: module-level `CFG` in `build.mjs`, used by every later task in this plan.

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
  const pkgPath = join(dir, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  pkg.okf = { conceptTypes: ['lesson'] };
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
  writeFileSync(join(dir, 'wiki/demo/alpha.md'),
    '---\ntype: lesson\ntitle: A\ndescription: d\n---\n\nbody\n');
  writeFileSync(join(dir, 'wiki/demo/beta.md'),
    '---\ntype: lesson\ntitle: B\ndescription: d\n---\n\nbody\n');
  const r = run(dir, '--check');
  clean(dir);
  assert.equal(r.status, 0, `expected pass; stderr=${r.stderr}`);
});

test('the status card class follows the configured default status', () => {
  const dir = sandbox();
  const pkgPath = join(dir, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  pkg.okf = { statusValues: ['wip', 'done'], statusDefault: 'wip' };
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
  writeFileSync(join(dir, 'wiki/demo/alpha.md'),
    '---\ntype: concept\ntitle: A\ndescription: d\nstatus: wip\n---\n\nbody\n');
  const r = run(dir);
  const html = readFileSync(join(dir, 'site/index.html'), 'utf8');
  clean(dir);
  assert.equal(r.status, 0, r.stderr);
  assert.match(html, /class="card wip"/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/okf.test.mjs test/build-check.test.mjs`
Expected: FAIL. `typeViolation` ignores `conceptTypes`; the card class emits `stub`, not `wip`.

- [ ] **Step 3: Thread the vocabulary through typeViolation**

Replace `lib/okf.mjs:25-36` with:
```javascript
// `area` is 'raw' | 'wiki'. Reserved files are filtered out by the caller, so this
// only ever validates concept documents. `conceptTypes` defaults to the built-in
// vocabulary so callers that predate configurable types keep working.
export function typeViolation({ area, type, conceptTypes = WIKI_CONCEPT_TYPES }) {
  if (!type) return 'missing required `type`';
  if (area === 'raw') return type === 'source' ? null : 'expected type "source"';
  if (area === 'wiki') {
    return conceptTypes.includes(type) ? null : `expected one of ${conceptTypes.join(', ')}`;
  }
  return `unknown area "${area}"`;
}
```

- [ ] **Step 4: Load config in build.mjs and use it**

After `build.mjs:24` (`const PKG = ...`), add:
```javascript
const CFG = resolveOkfConfig(PKG.okf);
```

Add `resolveOkfConfig` to the imports, from `./lib/config.mjs`.

Replace `build.mjs:26` and `:32` with:
```javascript
const WIKI_TITLE = CFG.title || WIKI_NAME;
const FEDERATION = CFG.federation;
```

In `validate`, pass the vocabulary at both `typeViolation` call sites:
```javascript
    const v = typeViolation({ area: 'wiki', type: c.data.type, conceptTypes: CFG.conceptTypes });
```
The `raw` call site keeps its current form; `source` is fixed by the spec and not configurable.

Replace the card class expression at `build.mjs:311`:
```javascript
    `<a class="card${statusClass(c.data.status)}" href="${hrefPrefix}${c.slug}.html">` +
```

Add near the other small helpers in `build.mjs`:
```javascript
// The card gets a status class only for the configured default status, which is the
// "needs work" signal this template has always rendered. Any other value gets no class.
const statusClass = (status) => (status && status === CFG.statusDefault ? ` ${status}` : '');
```

- [ ] **Step 5: Rename the CSS rule**

In `assets/wiki.css`, find the `.card.stub` rule and add a `.card.wip` sibling is **not** correct, because the class is now arbitrary. Instead replace the selector with an attribute-independent pair so any status class inherits the styling:

```css
.card.stub, .card.draft, .card.wip { opacity: .72; border-style: dashed; }
```

Keep the original declarations from the existing `.card.stub` rule; only the selector list changes. A clone with a different vocabulary adds its own selector, which `docs/okf-profile.md` documents.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, including the two new cases.

- [ ] **Step 7: Commit**

```bash
git add lib/okf.mjs build.mjs assets/wiki.css test/okf.test.mjs test/build-check.test.mjs
git commit -m "feat: drive vocabularies from okf config"
```

---

### Task 4: Update ingest to emit v0.2

Must land **before** Task 5. `ingest/ingest/draft.py:30` emits `status: stub` and `timestamp:`, and `:36` emits a `# Citations` section. Once Task 5 prohibits those, `npm run ingest` would generate content that `npm run check` rejects on the same run.

**Files:**
- Modify: `ingest/ingest/draft.py:25-38`, `ingest/ingest/cli.py` (pass status through)
- Modify: `ingest/tests/test_draft.py`

**Interfaces:**
- Produces: `build_stub(*, title, raw_path, headings, timestamp, status)`. `status` is required and must be a non-empty string; the CLI resolves it and fails early when it cannot.

- [ ] **Step 1: Write the failing tests**

Append to `ingest/tests/test_draft.py`:
```python
def test_stub_emits_v02_provenance_and_sources():
    out = build_stub(
        title="T", raw_path="raw/t/f.md", headings=[],
        timestamp="2026-08-20T00:00:00Z", status="draft",
    )
    assert 'generated: { by: "tool:ingest", at: "2026-08-20T00:00:00Z" }' in out
    assert "status: draft" in out
    assert "timestamp:" not in out
    assert "# Citations" not in out
    assert "sources:" in out
    assert "raw/t/f.md" in out


def test_stub_requires_a_status():
    with pytest.raises(ValueError):
        build_stub(title="T", raw_path="r.md", headings=[], timestamp="t", status="")
```

Add `import pytest` at the top of the file if absent.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ingest && uv run pytest tests/test_draft.py -v`
Expected: FAIL. `build_stub` has no `status` parameter.

- [ ] **Step 3: Rewrite build_stub**

Replace `ingest/ingest/draft.py:25-38`:
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
        f"  - id: raw-source\n"
        f"    resource: {yaml_str(raw_path)}\n"
        f"    title: {yaml_str(title)}\n"
        "---\n"
    )
    outline = (BANNER + "\n\n" + "\n\n".join(headings) + "\n") if headings else (NO_OUTLINE + "\n")
    return front + "\n" + outline
```

The `# Citations` section is gone; the raw file is cited through `sources:` instead.

- [ ] **Step 4: Resolve the status in the CLI**

In `ingest/ingest/cli.py`, before the `build_stub` call at line 68, read the resolved status from `package.json` and fail early:
```python
    okf = json.loads((root / "package.json").read_text()).get("okf", {})
    values = okf.get("statusValues") or ["stub", "learning", "researched", "solid"]
    status = okf.get("statusDefault") or ("stable" if "stable" in values else "")
    if not status:
        raise SystemExit(
            "ingest: no resolvable status. Set `okf.statusDefault` in package.json to one of: "
            + ", ".join(values)
        )
```

Add `import json` to the imports if absent, then pass `status=status` to `build_stub`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd ingest && uv run pytest -v`
Expected: PASS, including the existing integration tests.

- [ ] **Step 6: Commit**

```bash
git add ingest
git commit -m "feat(ingest): emit v0.2 frontmatter"
```

---

### Task 5: Prohibit the legacy forms and validate the v0.2 shapes

**Files:**
- Modify: `lib/okf.mjs` (append validators), `build.mjs:202-258` (`validate`)
- Modify: `test/okf.test.mjs`, `test/build-check.test.mjs`

**Interfaces:**
- Produces, all pure, all in `lib/okf.mjs`:
  - `prohibitedKeyViolations(data)` returns `string[]`
  - `citationsHeadingViolation(content)` returns `string|null`
  - `isoViolations(data)` returns `string[]`
  - `sourceViolations(data, content)` returns `string[]`
  - `supersededByViolations(key, data, conceptIds)` returns `string[]`

- [ ] **Step 1: Write the failing unit tests**

Append to `test/okf.test.mjs`:
```javascript
import {
  prohibitedKeyViolations, citationsHeadingViolation, isoViolations,
  sourceViolations, supersededByViolations,
} from '../lib/okf.mjs';

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
  const dupe = { sources: [{ id: 'a', resource: 'r', title: 't' }, { id: 'a', resource: 'r2', title: 't2' }] };
  assert.match(sourceViolations(dupe, 'x[^a]\n')[0], /duplicate source id/);
  assert.match(sourceViolations({ sources: [{ id: 'a' }] }, 'x[^a]\n')[0], /missing `resource`/);
});

test('superseded_by is validated whenever present', () => {
  const ids = new Set(['t/new', 't/old']);
  assert.deepEqual(supersededByViolations('t/old', { superseded_by: 't/new' }, ids), []);
  assert.match(supersededByViolations('t/old', { superseded_by: 't/ghost' }, ids)[0], /no such page/);
  assert.match(supersededByViolations('t/old', { superseded_by: 't/old' }, ids)[0], /points at itself/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/okf.test.mjs`
Expected: FAIL with import errors for the five new functions.

- [ ] **Step 3: Write the validators**

Append to `lib/okf.mjs`:
```javascript
// --- v0.2 profile validators ------------------------------------------------
//
// These are AUTHORING-PROFILE rules, stricter than OKF itself: the spec requires consumers
// to tolerate unknown keys, so a document these reject can still be valid OKF. Message text
// therefore says "prohibited by this profile" and never "invalid OKF".

const PROHIBITED_KEYS = { timestamp: '`generated.at`' };

export function prohibitedKeyViolations(data) {
  return Object.keys(PROHIBITED_KEYS)
    .filter((k) => data[k] !== undefined)
    .map((k) => `\`${k}\` is prohibited by this profile; use ${PROHIBITED_KEYS[k]}`);
}

// Strips fenced code before scanning, so a heading shown as an example in a code block
// is not mistaken for a real one.
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
  const out = [];
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
    return [`\`${label}\` must be a mapping with \`by\` and \`at\``];
  }
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
  const out = [];
  const sources = data.sources === undefined ? [] : data.sources;
  if (!Array.isArray(sources)) return ['`sources` must be a list'];

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

export function supersededByViolations(key, data, conceptIds) {
  const target = data.superseded_by;
  if (target === undefined) return [];
  if (typeof target !== 'string') return ['`superseded_by` must be a topic/slug string'];
  if (target === key) return ['`superseded_by` points at itself'];
  if (!conceptIds.has(target)) return [`\`superseded_by\` ${target} (no such page)`];
  return [];
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

test('unknown frontmatter keys are preserved into the manifest', () => {
  const dir = sandbox();
  const pkgPath = join(dir, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  pkg.okf = { federation: true };
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
  writeFileSync(join(dir, 'wiki/demo/alpha.md'),
    '---\ntype: concept\ntitle: A\ndescription: d\nlegacy_timestamp: 2026-01-01T00:00:00Z\n---\n\nbody\n');
  const r = run(dir);
  clean(dir);
  assert.equal(r.status, 0, r.stderr);
});
```

- [ ] **Step 6: Run e2e tests to verify they fail**

Run: `node --test test/build-check.test.mjs`
Expected: FAIL. `validate` does not call the new validators yet.

- [ ] **Step 7: Wire the validators into validate()**

In `build.mjs`, add the five functions to the `./lib/okf.mjs` import list. Then inside `validate`, immediately after the existing concept type loop, insert:

```javascript
  // v0.2 profile: prohibited legacy forms, frontmatter shapes, source/footnote integrity.
  const conceptIds = new Set(concepts.map((c) => c.key));
  for (const c of concepts) {
    for (const m of prohibitedKeyViolations(c.data)) problems.push(`${c.key} -> ${m}`);
    const heading = citationsHeadingViolation(c.content);
    if (heading) problems.push(`${c.key} -> ${heading}`);
    for (const m of isoViolations(c.data)) problems.push(`${c.key} -> ${m}`);
    for (const m of sourceViolations(c.data, c.content)) problems.push(`${c.key} -> ${m}`);
    for (const m of supersededByViolations(c.key, c.data, conceptIds)) problems.push(`${c.key} -> ${m}`);
  }
```

Delete the later `const conceptIds = ...` line in the wikilink block, since it is now declared above. Leave the wikilink loop otherwise untouched.

- [ ] **Step 8: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add lib/okf.mjs build.mjs test/okf.test.mjs test/build-check.test.mjs
git commit -m "feat: enforce the okf v0.2 authoring profile"
```

---

### Task 6: Allow okf_version on the bundle root

Resolves the live contradiction: `AGENTS.md` forbids frontmatter on reserved files, while the spec permits `okf_version` on the bundle-root `index.md` only.

**Files:**
- Create: `wiki/index.md`, `test/fixtures/minimal/wiki/index.md`
- Modify: `build.mjs:209-212` (the reserved-file loop)
- Modify: `test/build-check.test.mjs`

**Interfaces:**
- Consumes: nothing new.
- Produces: the rule that `wiki/index.md` may carry exactly one frontmatter key, `okf_version`.

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

Replace the reserved-file loop body in `build.mjs` (currently lines 209-212):
```javascript
  for (const r of [...reserved, ...rawDocs.filter((d) => d.reserved)]) {
    if (isReservedPath(r.repoRel)) continue;
    if (!hasFrontmatter(r.raw)) continue;
    // SPEC 12: the bundle-root index.md is the ONE place frontmatter is permitted, and only
    // to declare okf_version. Every other index.md, and any other key here, stays rejected.
    if (r.repoRel === 'wiki/index.md') {
      const keys = Object.keys(matter(r.raw).data);
      if (keys.length === 1 && keys[0] === 'okf_version') continue;
      problems.push(`${r.repoRel} -> bundle-root index.md may declare only \`okf_version\``);
      continue;
    }
    problems.push(`${r.repoRel} -> reserved file (${r.base}) must have no frontmatter`);
  }
```

- [ ] **Step 4: Create the real and fixture bundle roots**

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

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add build.mjs wiki/index.md test/fixtures test/build-check.test.mjs
git commit -m "feat: declare okf_version on the bundle root"
```

---

### Task 7: Write the migration and migrate the shipped topic

**Files:**
- Create: `lib/migrate.mjs`, `scripts/migrate.mjs`, `test/migrate.test.mjs`, `test/fixtures/legacy-v01/`
- Modify: `package.json` (add the `migrate` script), `wiki/getting-started/welcome.md`, `wiki/getting-started/writing-concepts.md`

**Interfaces:**
- Consumes: `DEFAULT_STATUS_VALUES` from Task 2 (for the status map's domain).
- Produces: `DEFAULT_STATUS_MAP`, `migrateFrontmatter(data, opts)` returning `{ data, notes }`, `migrateBody(content)` returning `{ content, sources, notes }`, `parseStatusMap(spec)` returning an object.
- Produces: `npm run migrate` with flags `--generated-by <actor>` and `--status-map <old>=<new>,...`.

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

test('a Citations list becomes sources with footnote markers', () => {
  const { content, sources } = migrateBody(
    'A claim.\n\n# Citations\n\n- https://example.com/a\n- `raw/t/f.md`\n');
  assert.ok(!content.includes('# Citations'));
  assert.equal(sources.length, 2);
  assert.equal(sources[0].resource, 'https://example.com/a');
  assert.equal(sources[1].resource, 'raw/t/f.md');
  assert.ok(sources.every((s) => s.id && s.title));
  for (const s of sources) assert.ok(content.includes(`[^${s.id}]`), `marker for ${s.id}`);
});

test('a body with no Citations section is untouched', () => {
  const { content, sources } = migrateBody('Just prose.\n');
  assert.equal(content, 'Just prose.\n');
  assert.deepEqual(sources, []);
});

test('migration is idempotent', () => {
  const once = migrateFrontmatter({ timestamp: '2026-01-01T00:00:00Z', status: 'solid' }, {});
  const twice = migrateFrontmatter(once.data, {});
  assert.deepEqual(twice.data, once.data);
  const b1 = migrateBody('A.\n\n# Citations\n\n- https://e.com/a\n');
  const b2 = migrateBody(b1.content);
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
// The one rule that shapes everything here: `generated.by` records WHO produced a page, and a
// v0.1 page does not carry that fact. So the default path never writes it. `legacy_timestamp`
// is an extension key that makes no provenance claim, which is what lets the default finish in
// a state `check` accepts without inventing an author.

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
    .split('-').slice(0, 4).join('-');
  return base || `source-${i + 1}`;
};

const CITATIONS_BLOCK = /\n#{1,6}[ \t]+Citations[ \t]*\n([\s\S]*?)(?=\n#{1,6}[ \t]|$)/;

// A `# Citations` list becomes `sources:` entries plus one footnote marker each, appended to the
// body so no citation is silently dropped. A body with no such section is returned unchanged.
export function migrateBody(content) {
  const m = CITATIONS_BLOCK.exec(content);
  if (!m) return { content, sources: [], notes: [] };

  const items = m[1].split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('- '))
    .map((l) => l.slice(2).trim().replace(/^`|`$/g, ''));

  const seen = new Set();
  const sources = items.map((resource, i) => {
    let id = slugifyId(resource, i);
    while (seen.has(id)) id = `${id}-${i + 1}`;
    seen.add(id);
    return { id, resource, title: resource };
  });

  let body = content.replace(CITATIONS_BLOCK, '\n').replace(/\n{3,}$/, '\n');
  if (sources.length) {
    body = `${body.replace(/\s*$/, '')}\n\n${sources.map((s) => `[^${s.id}]: ${s.resource}`).join('\n')}\n`;
    const markers = sources.map((s) => `[^${s.id}]`).join('');
    body = body.replace(/\n\n\[\^/, `${markers}\n\n[^`);
  }
  return { content: body, sources, notes: [] };
}
```

- [ ] **Step 4: Run unit tests to verify they pass**

Run: `node --test test/migrate.test.mjs`
Expected: PASS, 9 tests.

- [ ] **Step 5: Write the CLI wrapper**

`scripts/migrate.mjs`:
```javascript
#!/usr/bin/env node
// Rewrites v0.1 content to v0.2 in place. Idempotent: a second run changes nothing.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { migrateFrontmatter, migrateBody, parseStatusMap } from '../lib/migrate.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i === -1 ? null : argv[i + 1];
};

const generatedBy = flag('--generated-by');
const statusMap = parseStatusMap(flag('--status-map'));

const walk = (dir) => {
  let out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out = out.concat(walk(p));
    else if (e.name.endsWith('.md')) out.push(p);
  }
  return out;
};

let changed = 0;
const notes = [];
for (const area of ['wiki', 'raw']) {
  const base = join(ROOT, area);
  let files = [];
  try { files = statSync(base).isDirectory() ? walk(base) : []; } catch { continue; }
  for (const file of files) {
    const rel = relative(ROOT, file);
    const raw = readFileSync(file, 'utf8');
    if (!raw.startsWith('---')) continue; // reserved files carry no frontmatter
    const parsed = matter(raw);
    const fm = migrateFrontmatter(parsed.data, { generatedBy, statusMap });
    const body = migrateBody(parsed.content);
    const data = { ...fm.data };
    if (body.sources.length) data.sources = [...(data.sources || []), ...body.sources];
    const next = matter.stringify(body.content, data);
    for (const n of [...fm.notes, ...body.notes]) notes.push(`${rel}: ${n}`);
    if (next !== raw) { writeFileSync(file, next); changed += 1; console.log(`migrated ${rel}`); }
  }
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

In `package.json`, add to `scripts`:
```json
    "migrate": "node scripts/migrate.mjs",
```

- [ ] **Step 7: Create the legacy fixture and an end-to-end idempotence test**

`test/fixtures/legacy-v01/` mirrors `minimal/` but with v0.1 content. Copy `minimal/`, then replace `wiki/demo/alpha.md`:
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

Append to `test/migrate.test.mjs`:
```javascript
import { spawnSync } from 'node:child_process';
import { mkdtempSync, cpSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test('migrate makes a v0.1 bundle pass check, and twice is a no-op', () => {
  const dir = mkdtempSync(join(tmpdir(), 'okf-mig-'));
  cpSync(join(ROOT, 'test/fixtures/legacy-v01'), dir, { recursive: true });
  for (const p of ['build.mjs', 'lib', 'scripts', 'assets']) {
    cpSync(join(ROOT, p), join(dir, p), { recursive: true });
  }
  symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'), 'dir');

  const before = spawnSync('node', ['build.mjs', '--check'], { cwd: dir, encoding: 'utf8' });
  assert.equal(before.status, 1, 'the legacy fixture must fail check before migrating');

  const m1 = spawnSync('node', ['scripts/migrate.mjs'], { cwd: dir, encoding: 'utf8' });
  assert.equal(m1.status, 0, m1.stderr);
  const after = readFileSync(join(dir, 'wiki/demo/alpha.md'), 'utf8');
  assert.ok(after.includes('legacy_timestamp'), 'timestamp must become legacy_timestamp');
  assert.ok(!after.includes('\ntimestamp:'), 'no timestamp key may survive');
  assert.ok(!/generated:/.test(after), 'no provenance may be invented');
  assert.ok(after.includes('status: stable'), 'solid must map to stable');

  const check = spawnSync('node', ['build.mjs', '--check'], { cwd: dir, encoding: 'utf8' });
  assert.equal(check.status, 0, `migrated bundle must pass check; stderr=${check.stderr}`);

  spawnSync('node', ['scripts/migrate.mjs'], { cwd: dir, encoding: 'utf8' });
  assert.equal(readFileSync(join(dir, 'wiki/demo/alpha.md'), 'utf8'), after, 'second run is a no-op');
  rmSync(dir, { recursive: true, force: true });
});
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `node --test test/migrate.test.mjs`
Expected: PASS.

- [ ] **Step 9: Migrate the shipped topic**

Run: `npm run migrate`
Expected: `wiki/getting-started/welcome.md` and `writing-concepts.md` change; `timestamp` becomes `legacy_timestamp`, `status: solid` becomes `status: stable`.

Then set the spec vocabulary in `package.json` now that content matches it:
```json
  "okf": {
    "conceptTypes": ["concept", "pattern", "worked-example"],
    "statusValues": ["draft", "stable", "deprecated"],
    "statusDefault": "stable",
    "reservedFiles": ["index.md", "log.md"],
    "archival": false,
    "federation": false
  },
```

- [ ] **Step 10: Verify the repo passes its own gate**

Run: `npm run check && npm test`
Expected: PASS both.

- [ ] **Step 11: Commit**

```bash
git add lib/migrate.mjs scripts/migrate.mjs test/migrate.test.mjs test/fixtures package.json wiki
git commit -m "feat: add v0.2 migration and migrate shipped pages"
```

---

### Task 8: Write the upgrade tool

**Files:**
- Create: `lib/upgrade.mjs`, `scripts/upgrade.mjs`, `test/upgrade.test.mjs`, `.okf-template-version`
- Modify: `package.json` (add the `upgrade` script)

**Interfaces:**
- Consumes: `DEFAULT_CONCEPT_TYPES`, `DEFAULT_STATUS_VALUES` from Task 2.
- Produces: `ENGINE_PATHS`, `patchPackageJson(clonePkg, templatePkg)`, `replaceMarkedBlock(text, block, marker)`, `configTransition(clonePkg)`, `MARKER`.

- [ ] **Step 1: Write the failing tests**

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

test('replaceMarkedBlock swaps only the marked region', () => {
  const text = [
    '# My Wiki', '', 'My own prose.', '',
    `<!-- ${MARKER}:begin -->`, 'OLD RULES', `<!-- ${MARKER}:end -->`, '',
    'More of my prose.', '',
  ].join('\n');
  const out = replaceMarkedBlock(text, 'NEW RULES', MARKER);
  assert.ok(out.includes('NEW RULES'));
  assert.ok(!out.includes('OLD RULES'));
  assert.ok(out.includes('My own prose.'));
  assert.ok(out.includes('More of my prose.'));
});

test('replaceMarkedBlock throws when the markers are missing', () => {
  assert.throws(() => replaceMarkedBlock('no markers here', 'X', MARKER), /marker/);
});

test('configTransition writes the legacy block when the clone has none', () => {
  const t = configTransition({ name: 'w' });
  assert.equal(t.action, 'write-legacy');
  assert.deepEqual(t.okf.statusValues, ['stub', 'learning', 'researched', 'solid']);
  assert.deepEqual(t.okf.conceptTypes, ['concept', 'pattern', 'worked-example']);
  assert.match(t.message, /npm run migrate --status-map/);
});

test('configTransition never touches an existing block', () => {
  const t = configTransition({ okf: { statusValues: ['wip'] } });
  assert.equal(t.action, 'keep');
  assert.equal(t.okf, undefined);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/upgrade.test.mjs`
Expected: FAIL with "Cannot find module '../lib/upgrade.mjs'".

- [ ] **Step 3: Write the pure helpers**

`lib/upgrade.mjs`:
```javascript
// Pure helpers for `npm run upgrade`. No I/O, no deps.
//
// Upgrades are a file sync from a pinned release, not a git merge: this template is used via
// GitHub's "Use this template", which produces a repository with unrelated history, so no
// template commit is ever an ancestor of a clone.
import { DEFAULT_CONCEPT_TYPES, DEFAULT_STATUS_VALUES, DEFAULT_RESERVED_FILES } from './config.mjs';

// ENGINE: replaced wholesale, because these files have exactly one owner.
export const ENGINE_PATHS = [
  'lib', 'build.mjs', 'scripts', 'test', '.github',
  'assets', 'docs/okf-profile.md', 'docs/upgrading.md', 'docs/composing.md',
];

// package.json fields the template owns. Everything else in that file is the clone's.
export const ENGINE_PKG_FIELDS = ['scripts', 'dependencies', 'engines'];

export const MARKER = 'okf-template:profile-min';

export function patchPackageJson(clonePkg, templatePkg) {
  const out = { ...clonePkg };
  for (const field of ENGINE_PKG_FIELDS) {
    if (templatePkg[field] === undefined) continue;
    // Template entries win per key; clone-only entries survive.
    out[field] = { ...(clonePkg[field] || {}), ...templatePkg[field] };
  }
  // `engines` is a whole-value replacement: a floor is not a merge.
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
  return text.slice(0, i + begin.length) + '\n' + block.replace(/^\n+|\n+$/g, '') + '\n' + text.slice(j);
}

// A clone with no `okf` block gets the LEGACY vocabulary written explicitly, so upgrading never
// silently changes which documents are valid. Opting into the spec vocabulary is a separate,
// deliberate step the message names.
export function configTransition(clonePkg) {
  if (clonePkg.okf !== undefined) return { action: 'keep' };
  return {
    action: 'write-legacy',
    okf: {
      conceptTypes: [...DEFAULT_CONCEPT_TYPES],
      statusValues: [...DEFAULT_STATUS_VALUES],
      statusDefault: null,
      reservedFiles: [...DEFAULT_RESERVED_FILES],
      archival: false,
      federation: false,
    },
    message:
      'wrote the legacy `okf` block to preserve current behavior. To adopt the OKF v0.2 ' +
      'vocabulary, run: npm run migrate --status-map stub=draft,learning=draft,' +
      'researched=stable,solid=stable and then set statusValues to draft/stable/deprecated.',
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/upgrade.test.mjs`
Expected: PASS, 6 tests.

- [ ] **Step 5: Write the CLI wrapper**

`scripts/upgrade.mjs`:
```javascript
#!/usr/bin/env node
// Syncs ENGINE files from a pinned template release. Idempotent for the same release.
//
// Usage: npm run upgrade -- [--release <tag>] [--from <dir>] [--dry-run]
//   --from <dir>  use an already-extracted template tree instead of fetching (used by tests)
import { readFileSync, writeFileSync, cpSync, existsSync, rmSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ENGINE_PATHS, patchPackageJson, replaceMarkedBlock, configTransition, MARKER } from '../lib/upgrade.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = (n) => { const i = argv.indexOf(n); return i === -1 ? null : argv[i + 1]; };
const DRY = argv.includes('--dry-run');
const REPO = 'https://github.com/het-sheth/okf-wiki-template';

const report = [];
const log = (m) => { report.push(m); console.log(m); };

function fetchRelease(tag) {
  const dir = mkdtempSync(join(tmpdir(), 'okf-upgrade-'));
  const url = `${REPO}/archive/refs/tags/${tag}.tar.gz`;
  const r = spawnSync('sh', ['-c', `curl -fsSL ${url} | tar -xz -C ${dir} --strip-components=1`], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`could not fetch ${tag}: ${r.stderr}`);
  return dir;
}

const from = flag('--from');
const tag = flag('--release') || 'latest';
const src = from || fetchRelease(tag);

// 1. ENGINE files: wholesale replacement.
for (const p of ENGINE_PATHS) {
  const s = join(src, p);
  if (!existsSync(s)) continue;
  if (!DRY) { rmSync(join(ROOT, p), { recursive: true, force: true }); cpSync(s, join(ROOT, p), { recursive: true }); }
  log(`replaced ${p}`);
}

// 2. package.json: engine fields patched, clone fields preserved.
const clonePkgPath = join(ROOT, 'package.json');
const clonePkg = JSON.parse(readFileSync(clonePkgPath, 'utf8'));
const tmplPkg = JSON.parse(readFileSync(join(src, 'package.json'), 'utf8'));
let nextPkg = patchPackageJson(clonePkg, tmplPkg);
log('patched package.json (scripts, dependencies, engines)');

// 3. The config transition, always in the open.
const t = configTransition(clonePkg);
if (t.action === 'write-legacy') { nextPkg = { ...nextPkg, okf: t.okf }; log(`config: ${t.message}`); }
else log('config: kept your existing `okf` block');
if (!DRY) writeFileSync(clonePkgPath, `${JSON.stringify(nextPkg, null, 2)}\n`);

// 4. The AGENTS.md normative block.
const agentsPath = join(ROOT, 'AGENTS.md');
const canonical = readFileSync(join(src, 'docs/profile-min.md'), 'utf8');
try {
  const next = replaceMarkedBlock(readFileSync(agentsPath, 'utf8'), canonical, MARKER);
  if (!DRY) writeFileSync(agentsPath, next);
  log('replaced the AGENTS.md normative block; your prose was left alone');
} catch (e) {
  log(`SKIPPED AGENTS.md: ${e.message}`);
}

// 5. Lockfile is derived, never merged.
if (!DRY) spawnSync('npm', ['install', '--silent'], { cwd: ROOT, encoding: 'utf8' });
log('regenerated package-lock.json');

// 6. Record the release.
const version = tmplPkg.version || tag;
if (!DRY) writeFileSync(join(ROOT, '.okf-template-version'), `${version}\n`);

log('\nnot touched: wiki/ raw/ topics.json README.md, and your AGENTS.md prose');
log(`now on template ${version}. Run: npm run check`);
```

- [ ] **Step 6: Extract the canonical normative block**

Create `docs/profile-min.md`, the canonical text the tool injects. Keep it at 25 lines or fewer.

```markdown
## OKF profile (normative)

Markdown in `wiki/` is the source of truth; `site/` is generated, never hand-edited.

- Every concept page needs `type`. Allowed values come from `okf.conceptTypes`.
- `timestamp:` is prohibited by this profile. Use `generated: { by, at }`.
- A `# Citations` heading is prohibited. Cite through `sources:` entries, each with an `id`,
  `resource`, and `title`, and reference each one with a `[^id]` footnote marker at the claim
  it supports. A page-level gesture at sources lets a reader check nothing.
- Never invent content. Ground every claim in `raw/` or a cited source. Missing material stays
  a stub with the gap stated, never filled in from guesswork.
- Cross-link concepts with Markdown links or `[[wikilinks]]`; every link must resolve.
- Reserved files (`index.md`, `log.md`) carry no frontmatter, except `wiki/index.md`, which may
  declare `okf_version` and nothing else.
- Run `npm run check` before committing. It is a profile lint, stricter than OKF itself.

Full field tables, every `okf.*` key, and worked examples: `docs/okf-profile.md`.
```

- [ ] **Step 7: Register the script and seed the version file**

In `package.json` scripts, add:
```json
    "upgrade": "node scripts/upgrade.mjs",
```

Create `.okf-template-version` containing `2.0.0`.

- [ ] **Step 8: Write the end-to-end upgrade test**

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
  symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'), 'dir');

  // the clone has its own content, its own prose, and a stale engine file
  writeFileSync(join(dir, 'wiki/demo/mine.md'),
    '---\ntype: concept\ntitle: Mine\ndescription: d\n---\n\nMy page.\n');
  writeFileSync(join(dir, 'AGENTS.md'),
    `# demo wiki\n\nMy own conventions.\n\n<!-- okf-template:profile-min:begin -->\nOLD\n<!-- okf-template:profile-min:end -->\n\nMore of mine.\n`);
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
  assert.ok(pkg.okf, 'a legacy okf block must be written for a clone that had none');
  assert.deepEqual(pkg.okf.statusValues, ['stub', 'learning', 'researched', 'solid']);

  const check = spawnSync('node', ['build.mjs', '--check'], { cwd: dir, encoding: 'utf8' });
  assert.equal(check.status, 0, `upgraded clone must pass check; stderr=${check.stderr}`);
  rmSync(dir, { recursive: true, force: true });
});
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `node --test test/upgrade.test.mjs`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add lib/upgrade.mjs scripts/upgrade.mjs docs/profile-min.md test/upgrade.test.mjs package.json .okf-template-version
git commit -m "feat: add upgrade tool for engine file sync"
```

---

### Task 9: Restructure AGENTS.md and write the docs

**Files:**
- Modify: `AGENTS.md` (full restructure), `README.md` (siblings, compatibility table, upgrade section)
- Create: `docs/okf-profile.md`, `docs/upgrading.md`, `docs/composing.md`

**Interfaces:**
- Consumes: `docs/profile-min.md` from Task 8 (its text is what goes between the markers).

- [ ] **Step 1: Restructure AGENTS.md**

Replace the whole file with the clone-owned frame plus the marked block. Everything outside the markers is example prose a clone rewrites.

```markdown
# OKF Wiki: schema and conventions

A Markdown-canonical knowledge base. Write pages under `wiki/<topic>/`, then run `npm run check`.

<!-- okf-template:profile-min:begin -->
<!-- Managed by `npm run upgrade`. Edit docs/profile-min.md in the template, not here. -->
... paste the exact contents of docs/profile-min.md here ...
<!-- okf-template:profile-min:end -->

## This wiki

Topics live in `topics.json`. Replace this section with your own domain conventions: what each
topic covers, naming rules, and anything a contributor to this subject needs that the profile
above does not say.

## Layout

- `wiki/<topic>/<slug>.md` concept pages, `wiki/<topic>/index.md` optional intro prose.
- `raw/<topic>/` immutable source material. Read, never rewrite.
- `site/` generated. `npm run build` only, never by hand.
```

- [ ] **Step 2: Verify the block matches its canonical source**

Run: `diff <(sed -n '/profile-min:begin/,/profile-min:end/p' AGENTS.md | sed '1,2d;$d') docs/profile-min.md`
Expected: no output. If it differs, copy `docs/profile-min.md` in verbatim.

- [ ] **Step 3: Write docs/okf-profile.md**

Full reference. Every vocabulary-dependent passage must name the config key that changes it, so the document is never wrong for a clone with its own vocabulary. Required sections:

- **Frontmatter fields**: `type` (required), `title`, `description`, `tags`, `resource`, `status`, `generated`, `verified`, `stale_after`, `sources`, `superseded_by`, `legacy_timestamp`. For each: whether the profile requires it, its shape, and one example.
- **A note on vocabularies**: "the examples below use the default configuration; `type` values come from `okf.conceptTypes` and `status` values from `okf.statusValues`, so a wiki configured for another subject will show different words."
- **Every `okf.*` key**: `conceptTypes`, `statusValues`, `statusDefault`, `reservedFiles`, `archival`, `federation`, `title`. Default, purpose, and effect.
- **Prohibited forms**: `timestamp` and `# Citations`, with the replacement and the reason (v0.2 renames), plus the note that the lint is stricter than OKF and a rejected bundle may still be valid OKF.
- **Sources and footnotes**: worked example of a page with two sources and two markers.
- **Links**: Markdown links, within-wiki wikilinks, cross-wiki wikilinks, and the federation flag.
- **Staleness**: `check` rejects a malformed `stale_after`; a past date is a report, not a failure.
- **Styling a custom status**: a clone with its own vocabulary adds a `.card.<status>` rule to `assets/wiki.css`.

- [ ] **Step 4: Write docs/upgrading.md**

Must state:

- Upgrades are a file sync, not a git merge, and why: GitHub's "Use this template" creates unrelated history, so no template commit is ever an ancestor of a clone. Do not attempt `git merge template/main`.
- `npm run upgrade -- --release v2.1.0`, and that `--dry-run` prints the report without writing.
- The ownership table: ENGINE replaced, USER never touched, `package.json` fields patched, `AGENTS.md` marked block replaced.
- What happens to a clone with no `okf` block: the legacy vocabulary is written explicitly, and the exact `npm run migrate --status-map ...` command to adopt the spec one.
- That `package-lock.json` is regenerated, not merged.
- That a missing marker pair in `AGENTS.md` makes the tool skip that file and report it, rather than guess.
- Recovery: the tool writes in place with no backup, so commit or stash before running it.

- [ ] **Step 5: Write docs/composing.md**

The subject-wiki counterpart of second-brain's. Must state:

- The three-way split: `example-agent-rules` is the behavior layer loaded every session and kept short; this template is a subject knowledge base loaded on demand; `example-second-brain` is one person's context layer with a journal and capture workflow.
- Where a given thing goes: a standing instruction goes to the rulebook, a personal daily note to the second brain, durable subject knowledge here.
- The wiring: one line in `_machine.md`'s Paths section naming this clone and saying to navigate by reading its `AGENTS.md` first, never by grepping the tree.
- That this template deliberately has no journal or daily-note templates, because those are the second brain's job.

- [ ] **Step 6: Update the README**

Add three things:

1. A **Related** section naming `example-agent-rules` and `example-second-brain` with one line each, pointing at `docs/composing.md`.
2. A **compatibility table**: template version, OKF spec version, node floor. First row: `2.0.0` / `0.2` / `>=20`.
3. An **Upgrading** section: one `npm run upgrade` example, and the sentence that merges are not the upgrade path, pointing at `docs/upgrading.md`.

- [ ] **Step 7: Verify pointer targets exist**

Run: `for f in $(grep -oE 'docs/[a-z-]+\.md' AGENTS.md README.md | sort -u); do test -f "$f" || echo "MISSING $f"; done`
Expected: no output.

- [ ] **Step 8: Run the full gate**

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
- Modify: `package.json` (`version` to `2.0.0`)

**Interfaces:**
- Consumes: every script from Tasks 1 through 9.

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

      # A real clone plus a real install, not a copied sandbox: the unit tests symlink the host
      # node_modules, so they never exercise installation.
      - name: clean clone install
        run: |
          git clone --depth 1 "file://$PWD" /tmp/clone
          cd /tmp/clone
          npm ci
          npm run check
          npm test

      - name: normative block matches its canonical source
        run: |
          sed -n '/profile-min:begin/,/profile-min:end/p' AGENTS.md | sed '1,2d;$d' > /tmp/block
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
```

Migration idempotence and the upgrade simulation are already covered by `test/migrate.test.mjs` and `test/upgrade.test.mjs`, which `npm test` runs inside the clean clone. No separate CI step duplicates them.

- [ ] **Step 2: Run the CI steps locally**

Run:
```bash
sed -n '/profile-min:begin/,/profile-min:end/p' AGENTS.md | sed '1,2d;$d' > /tmp/block && diff /tmp/block docs/profile-min.md && test "$(wc -l < docs/profile-min.md)" -le 25 && echo BLOCK_OK
git ls-files --error-unmatch site >/dev/null 2>&1 && echo "TRACKED (bad)" || echo SITE_OK
```
Expected: `BLOCK_OK` and `SITE_OK`.

- [ ] **Step 3: Write CONTRIBUTING.md**

Must cover:

- The gate: `npm run check && npm test` before any PR, and that exit code is the only signal.
- Where a change goes: profile rules in `lib/okf.mjs` plus `docs/profile-min.md`, config in `lib/config.mjs`, rendering in `build.mjs`, and that `lib/*.mjs` stays pure with I/O only in `build.mjs` and `scripts/`.
- The versioning rules, copied from the spec: the scaffold contract is the accepted-document set, the ENGINE manifest, the `okf` config schema, and whether a migration is required. MAJOR shrinks the accepted set or changes the manifest or schema incompatibly or needs a migration; MINOR adds an optional key, a script, or a check that only fires on newly rejected syntax; PATCH changes no contract.
- That a new prohibition needs a `migrate` path in the same PR, or it is not shippable.
- That `AGENTS.md` outside the markers belongs to the clone and the template must never write there.

- [ ] **Step 4: Write CHANGELOG.md**

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
  `reservedFiles`, `archival`, alongside the existing `federation` and `title`.
- `npm run migrate`: v0.1 to v0.2 content migration. Idempotent. Never invents provenance.
- `npm run upgrade`: syncs engine files from a pinned release. Not a git merge.
- `generated`, `verified`, `stale_after`, `sources`, `superseded_by` validation.
- `okf_version` on the bundle-root `wiki/index.md`.
- CI, CONTRIBUTING, this changelog, and `test/fixtures/`.
- `docs/okf-profile.md`, `docs/upgrading.md`, `docs/composing.md`.

### Changed
- `AGENTS.md` is clone-owned except the marked normative block.
- Concept types and the status card class come from config, not hardcoded values.
- Engine tests read `test/fixtures/`, so clone content cannot break them.
- Ingest emits v0.2 frontmatter and requires a resolvable status.

### Removed
- `timestamp:` is prohibited. Use `generated.at`, or `legacy_timestamp` for a value with no
  known author.
- The `# Citations` heading is prohibited. Use `sources:` with footnote markers.

### Upgrading
Run `npm run upgrade`, then `npm run migrate`, then `npm run check`. See `docs/upgrading.md`.
A clone with no `okf` block keeps the legacy vocabulary; adopting the v0.2 vocabulary is a
separate, deliberate step.
```

- [ ] **Step 5: Set the version**

In `package.json`, set `"version": "2.0.0"`.

- [ ] **Step 6: Run the full gate one last time**

Run: `npm run check && npm test && npm run build`
Expected: all three pass, and `site/` regenerates.

- [ ] **Step 7: Commit and tag**

```bash
git add .github CONTRIBUTING.md CHANGELOG.md package.json
git commit -m "chore: add ci, contributing, and changelog"
git tag -a v2.0.0 -m "okf v0.2 profile, config, migrate, upgrade"
```

Push the branch and open a PR. Do not push to `main` directly; the tag goes up after the PR merges.

---

## Self-review

**Spec coverage.** Every spec item maps to a task: upgrade tool and ownership to Task 8; test decoupling to Task 1; ingest-as-engine-tool note to Task 4 and `docs/upgrading.md` in Task 9; the marked `AGENTS.md` block to Tasks 8 and 9; cross-repo seams to Task 9 (`docs/composing.md` and the README) with the two sibling-repo edits deferred to the follow-on plan; profile items 1 through 8 to Tasks 3, 5, and 6; the config transition to Task 8; mechanical-only validation to Task 5; archival decoupling to Task 5; migrate to Task 7; ingest ordering and the required status to Task 4; the shipped topic migration to Task 7 step 9; parametric profile doc to Task 9; SemVer, two version numbers, releases, and CI to Task 10. The deferred conformance corpus stays deferred, as the spec's "Rejected approaches" records.

**Known gap, deliberate.** `voice-ai-wiki` conversion is out of scope per the spec and has no task here.

**Type consistency.** `resolveOkfConfig` returns the same seven keys everywhere it appears. `typeViolation` takes `conceptTypes` in Task 3 and is called with it in Tasks 3 and 5. `migrateFrontmatter` and `migrateBody` keep their Task 7 signatures in `scripts/migrate.mjs`. `MARKER` is defined once in `lib/upgrade.mjs` and used in Tasks 8, 9, and 10. Fixture topic names (`demo`, `alpha`, `beta`) are consistent from Task 1 onward.
