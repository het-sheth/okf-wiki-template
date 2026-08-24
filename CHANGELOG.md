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
- `npm run build` exits non-zero on validation failure and removes an existing `site/` so a stale
  render is never left behind looking current.
- `npm run upgrade` stages every ENGINE path before swapping any of them.

### Removed
- `timestamp:` is prohibited. Use `generated.at`, or `legacy_timestamp` for a value with no known
  author.
- The `# Citations` heading is prohibited. Use `sources:` with footnote markers.

### Upgrading
Run `npm run upgrade -- --release v2.0.0`, then `npm run migrate`, then `npm run check`. See
`docs/upgrading.md`. A clone with no `okf` block keeps the legacy vocabulary; adopting the v0.2
vocabulary is a separate, deliberate step.
The run is not atomic across `npm install`: a failed install can leave engine files updated while
the lockfile is stale. In that case the template version is not advanced, so fix installation and
rerun the same release to converge.
