# ADR-005: The Writer window is an Angular app built only from Syncfusion components

- **Status:** Proposed
- **Date:** 2026-10-24
- **Decision owners:** IndieWriter Studio maintainers

> 🟡 **Proposed, not Accepted.** Every ADR in this repository is held at Proposed until a person
> accepts it.

---

## Context

[ADR-004](adr-004-the-writer-is-an-electron-shell-over-the-indie-writer-root-with-ipc-as-the-fifth-transport.md)
gave the Writer an Electron shell and a page that can do only what the bridge allows. This record
covers the page itself: the works catalog, the Editions of a Work and the manuscript outline. The
Editor (writing the text of a section) is not part of it. `md-publisher` ADR-019 is the model for
the Syncfusion rules.

## Decision

1. **`apps/writer` is an Angular 22.2 application** (TypeScript 6.0, standalone components, signals,
   zoneless). It is built by Angular's own builder to `dist/apps/writer`, and `apps/electron`'s
   build ships that directory unchanged as its renderer.
2. **Every control is a Syncfusion component, one pinned version.** All `@syncfusion/*` packages are
   exactly 35.1.37, declared without ranges, imported package by package; a spec fails if any
   installed Syncfusion package differs (the Angular base package floats to a newer patch unless it
   is pinned too). Used so far: AppBar, Splitter, Grid, Toolbar, TreeView, Dialog (and
   `DialogUtility.confirm`), TextBox, TextArea, DropDownList, DatePicker, Toast, and the CSS Badge.
3. **The page talks to the app only through `window.indieWriter`.** Components never see an
   envelope: `WriterApi` runs named operations and returns data, or throws an `OperationError`
   whose message is what the author is told in a Toast. The bridge type is restated in the page
   (the ipc-bridge library's types reach into Node-only code); a spec checks that the preload
   bridge still fits it.
4. **Syncfusion's string templates are forbidden; Angular templates only.** Syncfusion compiles a
   string template (`template="#id"`) with `new Function`, which the content security policy
   (ADR-004 D4) blocks. Found by running the first spike in the real window. A spec scans the
   components for them.
5. **Themes carry no network reference.** The light and dark Material themes are rewritten at build
   time without the Google Fonts `@import`; dark follows the operating system's colour scheme
   through a `prefers-color-scheme` stylesheet link.
6. **The licence key is read at build time** from `SYNCFUSION_UI_LICENSE_KEY` into a generated,
   ignored module and registered before anything renders. Without it the build still succeeds and
   Syncfusion's banner shows; the application never hides it (it is moved to the footer and the
   page reserves its height).
7. **Acceptance runs in the real window.** The `window` profile of the Cucumber suite drives the
   built Electron app with Playwright as the Author would: through the page, never the bridge
   (`npm run acceptance:window`). The renderer's `data-testid` attributes are the contract with that
   suite. Writing a section's text is the Editor's job, so the one scenario that needs words in a
   section puts them there through the bridge.

## Findings from building it (for the next screens)

- **The optimised build drops the code that calls `ngOnChanges` on Syncfusion's base class**, and
  every component then fails to start. `App` declares an empty `ngOnChanges` so Angular keeps it.
- **TreeView with flat data needs `hasChildren` and a `null` parent** on root rows, or it draws
  only the roots. It also does not redraw when its `fields` change, so the tree is created afresh
  for each outline.
- **DropDownList: the real input is read-only and out of the tab order**; it opens from its
  wrapper, and the list ignores a click that arrives while it fades in.
- **DatePicker discards text it cannot read as a date**, but its input still holds it until the
  value is read, so the window sends the typed text and lets the app refuse an impossible date by
  name.
- **A Toolbar item that holds a control uses an Angular `ng-template`**, not a selector string.
- **Grid needs its feature services provided** (`SortService`), or it logs a warning and ignores the
  option.

## Interactions with no Syncfusion component

These are decisions for the maintainer; see also the appendix of ADR-004.

| #   | Interaction                        | Status in this window                                                                                                               |
| --- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The native application menu        | Electron's own, kept minimal (ADR-004 D7); the window has no menu of its own                                                        |
| 2   | Native file and folder dialogs     | Not needed yet                                                                                                                      |
| 3   | A section's text shown as Markdown | Not needed yet; the outline shows titles, kinds and word counts only                                                                |
| 4   | A general empty state              | Solved without a new control: the Grid's empty-row template, and a Syncfusion-styled paragraph where there is no Grid. **Confirm.** |

## Consequences

- A screen is built by spiking its components in the real window under the policy first.
- The renderer's tests that matter are acceptance scenarios in the window; unit specs cover only the
  pure mapping code and the rules above.
- The Electron build now depends on the Writer's build.

## Rejected alternatives

- **`unsafe-eval` in the policy** to let Syncfusion string templates work. It would weaken the one
  policy the whole security story rests on.
- **A hand-written control where Syncfusion has none.** Hides the gap; the maintainer decides.
