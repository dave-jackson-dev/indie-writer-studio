# ADR-004: The Writer is an Electron shell over the indie-writer root, with IPC as the fifth transport

- **Status:** Proposed
- **Date:** 2026-10-23
- **Decision owners:** IndieWriter Studio maintainers

> 🟡 **Proposed, not Accepted.** Every ADR in this repository is held at Proposed until a person
> accepts it.

---

## Context

The Writer is a single-user desktop app. [ADR-002](adr-002-indie-writer-is-the-composition-root-and-components-are-standalone-cqrs-apps.md)
made `indie-writer` the composition root with CLI, REPL, sidecar and HTTP transports, and
[ADR-003](adr-003-persistence-is-typedblite-vendored-as-a-prebuilt-bundle-over-one-shared-database.md)
put its data in TypeDBLite, which needs a Node main process. `md-publisher` (its ADR-012, ADR-018,
ADR-019) already worked out an Electron shell with an IPC transport and an Angular renderer built
from Syncfusion components. This record takes what applies and records what differs.

## Decision

1. **Electron hosts the application.** `apps/electron`'s main process boots the `indie-writer` root
   in-process and owns the window. Electron 44.9 embeds Node 24.22, so `node:sqlite` and the
   vendored TypeDBLite run in the main process with no native module.
2. **IPC is the fifth transport**, a thin adapter over the same `CqrsToolRuntime` as the other four.
   It takes `{ operation, input?, correlationId? }` on one channel (`indie-writer:request`) and
   returns the shared envelope unchanged; the request shape is the same one the sidecar reads, now
   one shared `dispatchRequest`. It has no operation list of its own.
3. **The page sees two functions and nothing else**, `window.indieWriter.request(...)` and
   `.help(...)`, through a sandboxed preload with context isolation; `ipcRenderer`, Node and
   `require` are never handed to the page. A request from any frame other than the shipped page is
   refused with a `FORBIDDEN_SENDER` envelope and never run.
4. **Security defaults are not optional.** `contextIsolation`, no Node integration, `sandbox`,
   `webSecurity`; navigation only within the shipped renderer, new windows denied; a single-instance
   lock; a content security policy that closes scripts (`script-src 'self'`, no `unsafe-eval`, no
   inline script) and the network (`connect-src 'none'`), and allows inline _styles_ because
   Syncfusion creates style elements at run time. The shipped page declares exactly that policy.
5. **Test harness modes exist only in an unpackaged build.** `--smoke` reports what the page can see;
   `--ipc-driver` reads one request per stdin line and sends it through the page's own bridge, which
   is how the acceptance suite runs every scenario over IPC.
6. **No worker process yet.** `md-publisher` runs generation off the main thread; nothing here is
   long-running. When something is, the transport gains progress and cancel then, not before.
7. **The native application menu is Electron's standard one** (window chrome and the clipboard),
   with nothing of the app's in it. Every in-window command lives in the renderer.
8. **The renderer is an Angular application built only from Syncfusion components**, in the next
   change; the Editor (a Rich Text Editor) is deliberately not part of it. Rules for that work:
   - One exact Syncfusion version for every `@syncfusion/*` package, including themes.
   - The licence key is read from `SYNCFUSION_UI_LICENSE_KEY` at build time and registered once at
     start-up. It is never committed or printed, and the licence banner is never hidden.
   - A component is adopted by a spike in the real window under the policy above; if one needs
     script evaluation, that is reported and decided, not allowed quietly.
   - **Any interaction with no Syncfusion component is reported to the maintainer to decide**; nothing
     is hand-written to fill the gap in the meantime. The running list is in the appendix.

## Consequences

- One request channel means every operation is reachable from the window with no per-operation
  wiring, and the acceptance suite can run the same scenarios over IPC.
- The page can do nothing the dispatch does not allow.
- The main process shares one process with the database; work that blocks it would block the window.
- The Electron binary is a 230 MB dev dependency, and running it in CI or a container needs a display
  (`xvfb`) and, as root, `--no-sandbox`; the launcher handles both.

## Appendix: interactions with no Syncfusion component (decisions for the maintainer)

| #   | Interaction                                     | Why there is no component                                                              | Status                                |
| --- | ----------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------- |
| 1   | The operating system's native application menu  | It is Electron's `Menu`, not a web control; Syncfusion's Menu draws inside the window. | Kept minimal and native (D7); confirm |
| 2   | Native file and folder dialogs (backup, export) | Syncfusion's Uploader handles web files, not OS paths.                                 | Not needed yet                        |
| 3   | Reading a node's Markdown as formatted text     | No read-only Markdown renderer; the Rich Text Editor is the deferred Editor.           | Not needed yet                        |
| 4   | A general empty state outside a Grid            | The Grid has an empty-row template; a blank panel has nothing.                         | Open                                  |

## Rejected alternatives

- **A localhost HTTP server for the window.** Opens a port and a second trust boundary for a single-user app.
- **Exposing `ipcRenderer` to the page.** Hands the page every channel the main process ever adds.
- **A hand-written control wherever Syncfusion has none.** Hides the gap; the maintainer decides.

## References

- `md-publisher` ADR-012 (Electron runtime and the IPC transport), ADR-018, ADR-019, ADR-020.
