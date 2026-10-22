# ADR-001: The Reader Ships as an Angular PWA — Electron and Capacitor Are Deferred

- **Status:** Accepted
- **Date:** 2026-10-22
- **Decision owners:** IndieWriter Studio maintainers

## Context

IndieWriter Studio is the authoring side of a two-product monorepo. The second product is a
standalone **Reader** app (working name _IndieReader Library_ — the name is not yet decided) that
lets readers open an author's works, with guarded access and a working offline mode.

Three delivery shapes were considered for the Reader: an installable web app (PWA), an Electron
desktop app, and a Capacitor mobile app. The Reader is a single Angular codebase either way; the
question is how many shells to build and maintain around it, and when.

The inputs to that question:

- **Most readers will not install anything.** A reader arriving from a newsletter or social link
  reads in the browser or leaves. Installation is realistic for a small group of subscribers and
  fans, mostly on phones. Desktop installs of a reader app are rare; people read on phones and
  e-readers.
- **A PWA already covers offline.** A service worker plus IndexedDB storage gives offline
  reading on Android and desktop Chrome/Edge, with an install-to-home-screen prompt.
- **iOS is the weak spot.** PWAs work on iOS, but background sync and push are limited and storage
  can be evicted when an app goes unused. This is the one concrete case for a native wrapper.
- **Each shell is a release pipeline.** Electron adds code signing, auto-update and a ~100 MB
  runtime. Capacitor adds store accounts, review cycles and — for any in-app sales — the store's
  commission. Neither has demand behind it yet.

## Decision

1. **The Reader is an Angular SPA delivered as an installable PWA**, backed by a NestJS API that
   guards access to an author's works. Offline reading is a requirement of the PWA, not a feature
   of a wrapper.

2. **Electron is deferred.** No Electron project is created. The PWA's desktop install mode is the
   desktop answer until demand says otherwise.

3. **Capacitor (iOS/Android) is deferred.** No Capacitor project is created. The Angular build
   must stay wrappable — see Decision 5 — so adding it later is a packaging task, not a rewrite.

4. **Deferral is conditional, and the triggers are written down.** Revisit this ADR when any of
   these is observed, not before:
   - **Capacitor:** readers (or the author) report that iOS offline storage is evicted or that
     lack of push notifications costs them chapters; _or_ a meaningful share of readers ask for a
     store listing; _or_ the product needs in-app purchase or a native capability the web lacks.
   - **Electron:** readers ask for a desktop install that the PWA does not satisfy; _or_ a
     feature needs filesystem or OS integration a browser cannot provide.

5. **Keep the door open at no cost.** Until a trigger fires: no feature may depend on a
   server-rendered page for core reading, offline storage goes behind a port with a browser
   adapter, and authentication uses a flow that also works from a native shell (OIDC with PKCE,
   no cookie-only session). These are design constraints, not extra work.

## Consequences

One build, one release pipeline and one test surface for the Reader at launch. The cost of this
choice is concentrated on iOS: until Capacitor exists, iOS readers get the weaker PWA experience,
and that is accepted.

If a store listing is later pursued, the store's rules on in-app purchase and on apps that sign in
to content bought elsewhere must be re-checked at that time; they change, and nothing here records
them.

## Alternatives considered

- **PWA + Capacitor + Electron from the start.** Rejected: three shells for an audience of unknown
  size, with signing, store review and update machinery to maintain before any reader has asked.
- **Capacitor first, no PWA.** Rejected: puts a store install between a casual reader and the
  work, which is the largest audience.
- **Electron only.** Rejected: smallest audience, heaviest install, and no mobile.
- **Native iOS/Android apps.** Rejected: duplicates the Angular codebase for no capability the
  Reader needs.

## Related

- The Studio authoring platform (VS Codium extension vs. a fork) is a separate decision and is
  not covered here.
