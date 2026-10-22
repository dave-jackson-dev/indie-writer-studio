# ADR-001: The Reader ships as an Angular PWA; Electron and Capacitor are deferred

- **Status:** Proposed
- **Date:** 2026-10-22
- **Decision owners:** IndieWriter Studio maintainers

> 🟡 **Proposed, not Accepted.** Every ADR in this repository is held at Proposed until a person
> accepts it. Drafting one as Accepted records an approval that did not happen.

---

## Context

IndieWriter Studio is the authoring side of a two-product monorepo. The second product is a
standalone **Reader** app (name undecided) that lets readers open an author's works, with guarded
access and a working offline mode. It is one Angular codebase; the question is how many shells to
build around it, and when.

- **Most readers will not install anything.** A reader arriving from a newsletter or social link
  reads in the browser or leaves. Installing is realistic for a small group of subscribers and
  fans, mostly on phones. Desktop installs of a reader app are rare.
- **A PWA already covers offline reading** (service worker plus client-side storage) on Android and
  desktop Chrome/Edge.
- **iOS is the weak spot.** PWAs work there, but background sync and push are limited and storage
  can be evicted when an app goes unused. That is the one concrete case for a native wrapper.
- **Each shell is a release pipeline.** Electron adds code signing, auto-update and a large
  runtime. Capacitor adds store accounts, review cycles and the stores' commission on any in-app
  sales. Neither has demand behind it yet.

## Decision

1. **The Reader is an Angular SPA delivered as an installable PWA**, backed by a NestJS API that
   guards access to an author's works. Offline reading is a requirement of the PWA itself.
2. **Electron is deferred.** No Electron project is created until a trigger in Decision 4 fires.
3. **Capacitor (iOS/Android) is deferred.** No Capacitor project is created until a trigger in
   Decision 4 fires. Capacitor wraps the same web build, so the PWA and a later Capacitor app share
   one codebase.
4. **The triggers are:**
   - _Capacitor:_ iOS offline storage is evicted or missing push costs readers chapters; or readers
     ask for a store listing; or the product needs in-app purchase or a native capability the web
     lacks.
   - _Electron:_ readers ask for a desktop install the PWA does not satisfy; or a feature needs
     filesystem or OS integration a browser cannot provide.
5. **Keep a native shell cheap to add.** Core reading must not depend on server-rendered pages;
   offline storage sits behind a port with a browser adapter; authentication uses a flow that also
   works from a native shell (OIDC with PKCE, not cookie-only sessions).
6. **Client-side storage engine is not decided here.** TypeDBLite's SQLite engine uses
   `node:sqlite`, which does not exist in a browser or a Capacitor WebView. Using TypeDBLite in the
   Reader needs a WASM or native SQLite adapter behind its engine port (lean-agile-os ADR-018) and
   is a separate decision.

## Consequences

### Positive

One build, one release pipeline and one test surface for the Reader at launch.

### Negative / Constraints

iOS readers get the weaker PWA experience until a Capacitor app exists. If a store listing is later
pursued, the stores' rules on in-app purchase and on apps that sign in to content bought elsewhere
must be re-checked then; they change, and nothing here records them.

### What was rejected

- **PWA + Capacitor + Electron from the start.** Three shells for an audience of unknown size, with
  signing, store review and update machinery before any reader has asked.
- **Capacitor first, no PWA.** Puts a store install between a casual reader and the work.
- **Electron only.** Smallest audience, heaviest install, no mobile.
- **Native iOS/Android apps.** Duplicates the codebase for no capability the Reader needs.

## References

- lean-agile-os ADR-018: a TypeQL engine is a port, and SQLite is one adapter.
- The Studio authoring platform (VS Codium extension vs. fork) is a separate decision.
