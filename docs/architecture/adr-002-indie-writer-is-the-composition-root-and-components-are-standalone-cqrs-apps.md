# ADR-002: `indie-writer` is the composition root; components are standalone CQRS apps

- **Status:** Proposed
- **Date:** 2026-10-23
- **Decision owners:** IndieWriter Studio maintainers

> 🟡 **Proposed, not Accepted.** Every ADR in this repository is held at Proposed until a person
> accepts it.

---

## Context

[ADR-001](adr-001-the-reader-ships-as-an-angular-pwa-electron-and-capacitor-are-deferred.md) calls for a
NestJS API that guards access to an author's works. The repository follows the `lean-agile-os`
structure: `apps/` for deployables and `libs/` for the code behind them, with the CQRS runtime
vendored from `lean-agile-os` as `libs/shared/cqrs-tool-runtime`.

In `lean-agile-os`, `mvp` is a composition root over standalone CQRS apps (`scm`, `skills`, `agents`
and others). Each of those runs on its own, and `mvp` imports their Nest modules and concatenates
their operation descriptors unchanged.

## Decision

1. **`apps/indie-writer` is the one composition root.** It serves the CLI, REPL, sidecar and HTTP
   transports over one operation list, and is the API gateway: `GET /health` dispatches
   `system.health` like any other client.
2. **Every other CQRS app is a component of it.** A component is `{ name, module, operations }`
   (`components.ts`): the root imports its module and concatenates its descriptors without
   rewriting them, so there is no code between a transport and a component's own descriptor.
3. **Components are standalone.** Each one also runs on its own, and none imports another
   component's internals; they meet only at the root.
4. **The root owns only what belongs to no component** (`system.*`).
5. **Layout.** Components get `apps/<name>` and `libs/<context>/{domain,application,infrastructure}`;
   `libs/shared` holds the vendored runtime.

## Consequences

- One `--help`, one OpenAPI document and one envelope for everything the platform can do.
- Adding a component is one entry in `COMPONENTS`; the walking skeleton ships with none.
- The root is a single deployable. A component that must scale separately can be run on its own
  (Decision 3) without a redesign.
- Nothing here decides authentication: the guard ADR-001 requires (OIDC with PKCE) is a later
  decision.

## References

- `lean-agile-os`: `apps/tooling/mvp` (composition root) and `apps/platform/api-gateway`.
