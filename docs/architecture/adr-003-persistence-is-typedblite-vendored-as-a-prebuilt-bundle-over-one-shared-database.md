# ADR-003: Persistence is TypeDBLite, vendored as a pre-built bundle, over one shared database

- **Status:** Proposed
- **Date:** 2026-10-23
- **Decision owners:** IndieWriter Studio maintainers

> 🟡 **Proposed, not Accepted.** Every ADR in this repository is held at Proposed until a person
> accepts it.

---

## Context

The works catalog and the manuscript were first persisted in memory and in JSON files so the CQRS
shape could be proved. Neither enforces anything: a JSON file cannot refuse a duplicate id, a
manuscript for a Work that does not exist, or a half-finished write, and an in-memory fake that
enforces nothing can pass tests the real store would fail.

`lean-agile-os` chose TypeDBLite (a SQLite-backed engine for the TypeQL subset it needs) for exactly
this: `@key` makes a duplicate impossible rather than unlikely, and the engine runs in one
transaction at a time. `md-publisher` already loads it from a sibling checkout during development
(its ADR-014) and vendors a pre-built bundle to ship (its ADR-020).

## Decision

1. **Works and manuscripts are persisted in TypeDBLite.** The JSON-file and hand-written in-memory
   adapters are removed; so is the file lock, because SQLite's own locking (`BEGIN IMMEDIATE`, a busy
   timeout, WAL) covers writers in other processes.
2. **The engine ships as a vendored, pre-built bundle** (`vendor/typedblite/typedblite.mjs` with a
   `PROVENANCE.json` recording the `lean-agile-os` commit and a SHA-256), produced by
   `tools/typedblite-vendor` from a clean, built sibling and verified by `npm run vendor:check`.
   It is used in development and in tests alike: no sibling checkout is needed to build or run.
3. **One shared database file** (`<data dir>/indie-writer.db`), to which each component contributes
   its schema; the root composes them in dependency order. A component never imports another's
   code, but the manuscript's schema refers to the `work` entity, so schema order is a real
   dependency.
4. **Real entities and relations, not JSON blobs.** `work`, `edition` and `manuscript-node` are
   entities with `@key`s; an edition belongs to a work, and a node to a work, by relation.
5. **What the engine does not enforce, the repositories check inside the transaction.** A relation
   insert whose `match` finds nothing does nothing and raises nothing, so "a manuscript needs an
   existing Work" is an explicit check, and removing a Work does not remove what depends on it, so
   dependants register a cascade hook that runs in the removal's own transaction.
6. **In-memory means SQLite's `:memory:` through the same engine.** Tests and the default in-process
   root use it, so the SQL, the unique indexes and the transactions are the production ones. Only
   restart scenarios need a file.
7. **All access goes through one queue.** A `SqliteEngine` has one connection and refuses
   overlapping transactions; a read that interleaved with a write would see uncommitted data.
8. **The `Manuscript` no longer carries `updatedAt`.** The engine updates an attribute only by
   deleting and re-inserting its owner, and deleting a manuscript record would sever its links;
   nothing read the stamp.

## Consequences

- The engine runs on `node:sqlite`, which needs a Node main process (Electron's, or the CLI's). It
  does not run in a browser; the Reader PWA's client storage stays a separate decision (ADR-001 D6).
- A 1.9 MB generated artifact and its provenance live in the repository, and refreshing the engine
  is a deliberate commit that the check keeps honest.
- `node:sqlite` prints an experimental warning on Node versions that still flag it.
- A repository costs more to write than a JSON file did; that is the price of the guarantees.

## Rejected alternatives

- **Keep JSON files and add checks.** Re-implements, badly and per file, what the engine gives for free.
- **Load the engine from a sibling checkout.** Fine for `md-publisher`'s development; here it would
  make every build and CI run depend on a second repository's state.
- **One database per component.** Cannot enforce a node's Work exists.
- **A hand-written in-memory repository for tests.** Differs in behaviour from the real store by construction.

## References

- `lean-agile-os` ADR-018 (a TypeQL engine is a port, and SQLite is one adapter), ADR-075, ADR-076.
- `md-publisher` ADR-014 and ADR-020.
