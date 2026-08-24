# Contributing

Run `npm run check && npm test` before every pull request. If you change `ingest/`, also run
`cd ingest && uv run --extra dev pytest`. Exit code is the only signal.

Every commit must leave `npm run check` green. A new prohibition needs its migration path and any
content fix in the same commit, or the change is not shippable.

## Where changes go

- Profile rules: `lib/okf.mjs` and `docs/profile-min.md`
- Configuration: `lib/config.mjs`
- Rendering: `build.mjs`

`lib/*.mjs` stays pure. I/O lives in `build.mjs` and `scripts/`.

`raw/` is immutable. No script may write to it.

## Versioning and releases

The scaffold contract is the accepted-document set, the ENGINE manifest, the `okf` config schema,
and whether a migration is required.

- MAJOR shrinks the accepted set, changes the manifest or schema incompatibly, or needs a migration.
- MINOR adds an optional key, a script, or a check that only fires on newly rejected syntax.
- PATCH changes no contract.

Releases must publish a tarball plus `SHA256SUMS`, because `npm run upgrade` refuses an
unverifiable release.

## Clone ownership

`AGENTS.md` outside the markers belongs to the clone. The template must never write there.
