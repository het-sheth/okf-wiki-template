# Upgrading a template clone

Upgrades are a file sync, not a git merge. GitHub's "Use this template" creates unrelated history,
so no template commit is an ancestor of a clone. Do not run `git merge template/main`.

Before upgrading, commit or stash your work. The tool writes in place and creates no backup.

```bash
npm run upgrade -- --release v2.1.0
```

`--release` is required. There is no default release. Add `--dry-run` to print the planned work
without writing anything.

`--from <dir>` is for local development and testing only. It uses an unverified, already-present
template tree, so do not use `--from` as a substitute for a release checksum.

## Verification before replacement

The tool downloads the requested release into a staging directory and verifies its tarball against
the release's published `SHA256SUMS` before it replaces anything. An incomplete or unverified
release aborts with the clone untouched.

It also copies every engine path to a sibling `<path>.upgrade-new` staging location before swapping
any engine path. A copy failure therefore aborts with the clone untouched. Once swapping begins,
the run is not atomic across the whole operation: a later `npm install` failure can leave engine
files swapped while the lockfile is not regenerated.

In that case, `.okf-template-version` is deliberately not advanced. Fix the installation problem
and rerun the same release. The sync converges on the requested release.

## Ownership

| Ownership | Upgrade behavior |
|---|---|
| ENGINE | Replaced: `lib/`, `build.mjs`, `scripts/`, `test/`, `.github/`, `assets/`, and the template-owned profile, upgrade, and composing documents. |
| USER | Never touched: `wiki/`, `raw/`, `topics.json`, `README.md`, and prose outside the marked `AGENTS.md` block. |
| `package.json` | Patches only template-owned `scripts`, `dependencies`, and `engines` fields. Other clone fields, including an existing `okf` block, remain yours. |
| `AGENTS.md` | Replaces only the `okf-template:profile-min` marked block. |

`package-lock.json` is regenerated with `npm install`, not merged. If installation fails, the
template version remains unadvanced as described above.

If `AGENTS.md` lacks a complete marker pair, the tool skips that file and reports the reason rather
than guessing where profile text belongs.

## Vocabulary transition

If a clone has no `okf` block, upgrade writes the legacy vocabulary explicitly so existing content
and card behavior do not change silently. To adopt the spec vocabulary, run exactly:

```bash
npm run migrate -- --status-map stub=draft,learning=draft,researched=stable,solid=stable
```

Then set `statusValues` to `draft/stable/deprecated` and `needsWorkStatus` to `draft` in the clone's
`okf` configuration. A clone that already has an `okf` block keeps it unchanged.
