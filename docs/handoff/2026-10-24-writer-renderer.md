# Handoff: the Writer renderer (2026-10-24)

## Where things stand

- `dev` holds everything merged through PR #8 (Electron shell, IPC transport, `ipc` acceptance assembly).
- **Branch `feat/writer-renderer` is pushed and green but not reviewed or merged; no PR is open.**
  Commits: `96d7144` RED, `5da2127` GREEN (this note is a third, docs-only commit). It is registered in
  the `mvp` register (`scm.branch.open` was used).
- The branch adds `apps/writer` (Angular 22.2, TS 6.0, Syncfusion 35.1.37 only), the `window` Cucumber
  profile (17 scenarios), ADR-005 (Proposed), and AGENTS.md updates. No Editor / Rich Text Editor.

## Verified at the green commit

`pnpm nx run-many -t typecheck test build` 33/33; `apps/electron` e2e 9/9; `npm run acceptance` 79/79;
`npm run acceptance:ipc` 79/79; `npm run acceptance:window` 17/17. Check `nx` exit status directly.

## Next steps

1. Run the review/close flow for `feat/writer-renderer` -> `dev` (review artifact JSON, max 3 rounds,
   PLAUSIBLE-only does not block). Close with:
   `mvp --cli scm.branch.close --json '{source,base:"dev",merge:"auto",title,body,message,"review-artifact":<path>,evidence:[...]}'`
   (note the key is `review-artifact`; `scm.branch.open` needs `project`, `name`, `base`, `current-item`).
   The known `delete-source` step failure is finished by hand; then `scm.register.remove`.
2. In a **fresh session** (so `SYNCFUSION_UI_LICENSE_KEY` is in the environment), rebuild and confirm the
   licence banner disappears and, if it does show, that it does not cover content. Do not ask the user to
   paste the key.
3. Open decisions for the user: confirm the empty-state approach (ADR-005 table row 4); native menu, native
   file dialogs and Markdown rendering are still undecided (not needed yet).
4. Known plausible review leftovers from PR #8 (not fixed): `failStart` in `apps/electron/src/main.ts`
   exits without closing an already-booted host; `BinaryApp.close()` returns early if the wrapper has
   already exited, so a surviving detached process group is not killed.

## Gotchas learned

- Syncfusion string templates (`template="#id"`) use `eval`; the CSP blocks it. Angular `ng-template` only
  (a spec guards this).
- `App.ngOnChanges` (empty) is a deliberate workaround; without it the optimised build fails to start
  every Syncfusion component.
- TreeView flat data needs `hasChildren` and `null` roots; recreate the tree per outline.
- DropDownList in tests: open from the wrapper, hover the item before clicking.
- `@syncfusion/ej2-angular-base` floats to a newer patch unless pinned; a spec checks all installed
  Syncfusion packages are 35.1.37.
- The acceptance runs need a display: `npm run acceptance:window` wraps `xvfb-run`; as root the app is
  launched with `--no-sandbox`.
- Cucumber step definitions are keyword-agnostic: do not define the same text under Given and When.
- User rules: work on `dev`; test-first (commit red, then green); "I CAN" Gherkin; all persistence in
  TypeDBLite; use `mvp` for branch open/close; the user deletes remote branches in GitHub.

## Remote branches for the user to delete

`chore/protect-main-and-dev-2026-10-23-00`, `revert/promote-dev-to-main-2026-10-23-00`,
`feat/api-walking-skeleton`, `feat/works-catalog`, `feat/manuscript`, `feat/typedblite-persistence`,
`feat/electron-shell`. `dev` is well ahead of `main`; promote only on the user's explicit go-ahead.
