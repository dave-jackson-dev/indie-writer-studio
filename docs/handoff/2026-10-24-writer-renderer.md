# Handoff: the Writer renderer (written 2026-10-24, updated 2026-10-25)

## Where things stand

- **The Writer renderer is merged.** `feat/writer-renderer` went into `dev` as PR #9 (`df0225f`) after two
  review rounds; the branch is gone locally and the register row is removed. `dev` holds everything
  through PR #9: Electron shell, IPC transport, the `ipc` acceptance assembly and `apps/writer`
  (Angular 22.2, TS 6.0, Syncfusion 35.1.37 only), the `window` Cucumber profile (19 scenarios),
  ADR-005 (Proposed) and the AGENTS.md updates. No Editor / Rich Text Editor.
- **The remote branch `origin/feat/writer-renderer` still exists** for the user to delete in GitHub.
- Review round 1 found one CONFIRMED defect (adding an Edition left the catalog's Editions count stale)
  and two more that failing scenarios showed real (the Publish dialog reused the last typed date;
  outline and editions loads had no stale-response guard). All fixed test-first: RED `38a03c7`,
  GREEN `7d9f445`, `fce3e98` (a Work becoming unselected also invalidates in-flight loads). Round 2 had
  no CONFIRMED findings.

## Verified at `fce3e98` (the merged head)

`npx nx run-many -t typecheck test build --skip-nx-cache` green for 14 projects; `npm run acceptance`
79/79; `npm run acceptance:ipc` 79/79; `npm run acceptance:window` 19/19; `nx run electron:e2e` green.
No project has a `lint` target, so lint ran on nothing. The Syncfusion licence key was not set in that
run, so the licence banner has not been checked.

## Next steps

1. In a **fresh session** (so `SYNCFUSION_UI_LICENSE_KEY` is in the environment), rebuild and confirm the
   licence banner disappears and, if it does show, that it does not cover content. Do not ask the user to
   paste the key.
2. Open decisions for the user: confirm the empty-state approach (ADR-005 table row 4); native menu, native
   file dialogs and Markdown rendering are still undecided (not needed yet).
3. Known plausible review leftovers, not fixed:
   - from PR #8: `failStart` in `apps/electron/src/main.ts` exits without closing an already-booted host;
     `BinaryApp.close()` returns early if the wrapper has already exited, so a surviving detached process
     group is not killed.
   - from review round 2: edit-mode save in `CatalogComponent` with no selection would add a Work (no UI
     path found); `CatalogComponent.refresh()` repeats `reload()`'s fetch line; the default Cucumber
     profile is now `features/*.feature`, so a feature in a new subdirectory is skipped by it.
4. `dev` is well ahead of `main`; promote only on the user's explicit go-ahead.

## Closing a branch, as it actually went

- `mvp` is installed globally from `lean-agile-os` (`npm run mvp:install` on its `dev` branch). A fresh
  container has neither it nor the gitignored `.mvp/` register: run `mvp mvp.workspace.init`, restore the
  row with `scm.register.update`, and create a local `dev` ref (the clone is single-branch) or
  `scm.review.context` reports the diff unreadable. `mvp.workspace.init` strips two blank lines from
  `AGENTS.md`; revert that.
- Review: `skill.push` the `code-review-durable-workflow` Skill (`{invocation, skill}`), then address steps
  with `{workflow, step}`. The finders carry no model pin, so they are performed by hand and recorded with
  `skill.step.complete` (`artifacts` is an object: `{findings: [...]}`).
- The review artifact goes in `.mvp/scm/reviews/<slug>-YYYY-MM-DDTHHMMZ.json` and names the full 40-character
  head SHA; round 2 names round 1's head as `previousSha`.
- Close with `scm.branch.close --json-file`, fields `source`, `base`, `merge: "auto"`, `title`, `body`,
  `message`, `evidence`, and `review-artifact` (the key is hyphenated; `scm.branch.open` needs `project`,
  `name` with a type prefix such as `docs/...`, `base`, `current-item`). The known `delete-source` step
  failure (`--negotiate-only needs one or more --negotiation-tip=*`) leaves the remote branch; then
  `scm.register.remove`.
- Do not run `mvp` with no arguments: it waits on stdin.

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
  launched with `--no-sandbox`. The first scenarios of a cold `acceptance:window` run once failed with
  "Electron failed to install correctly"; a re-run passed 19/19.
- Syncfusion types `DatePicker.value` as `Date`, but setting `null` is how it is cleared.
- Cucumber step definitions are keyword-agnostic: do not define the same text under Given and When.
- User rules: work on `dev`; test-first (commit red, then green); "I CAN" Gherkin; all persistence in
  TypeDBLite; use `mvp` for branch open/close; the user deletes remote branches in GitHub.

## Remote branches for the user to delete

`feat/writer-renderer`, `chore/protect-main-and-dev-2026-10-23-00`,
`revert/promote-dev-to-main-2026-10-23-00`, `feat/api-walking-skeleton`, `feat/works-catalog`,
`feat/manuscript`, `feat/typedblite-persistence`, `feat/electron-shell`.
