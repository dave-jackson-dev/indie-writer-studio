<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

# General Guidelines for working with Nx

- For navigating/exploring the workspace, invoke the `nx-workspace` skill first - it has patterns for querying projects, targets, and dependencies
- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- Prefix nx commands with the workspace's package manager (e.g., `pnpm nx build`, `npm exec nx test`) - avoids using globally installed CLI
- You have access to the Nx MCP server and its tools, use them to help the user
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.
- NEVER guess CLI flags - always check nx_docs or `--help` first when unsure

## Scaffolding & Generators

- For scaffolding tasks (creating apps, libs, project structure, setup), ALWAYS invoke the `nx-generate` skill FIRST before exploring or calling MCP tools

## When to use nx_docs

- USE for: advanced config options, unfamiliar flags, migration guides, plugin configuration, edge cases
- DON'T USE for: basic generator syntax (`nx g @nx/react:app`), standard commands, things you already know
- The `nx-generate` skill handles generator discovery internally - don't call nx_docs just to look up generator syntax

<!-- nx configuration end-->

<!-- BEGIN MVP WORKSPACE ONBOARDING -->

## Agent onboarding

- Read this repository's instructions and search its documentation before assuming how it works.
- Use `mvp.documentation.search` to find project decisions, procedures, and the bundled MVP How-To guides. For example:
  `mvp mvp.documentation.search --json '{"criteria":{"text":"the task you need to do","limit":10}}'`
- `mvp.workspace.init` indexes this repository's `docs/` and the packaged MVP How-To guides into this workspace's own document store. After changing documentation, refresh it with `mvp.documentation.ingest`.
- In an Nx monorepo, discover projects and targets with `npx nx show projects` and `npx nx show project <project> --json`; do not guess the affected project or its targets.
- Bundled How-To guides describe LeanAgileOS and the MVP tools. Treat this repository's own instructions and conventions as authoritative, and adapt the guides rather than assuming every example applies unchanged.

<!-- END MVP WORKSPACE ONBOARDING -->

## Conventions

- **Gherkin story lines are "I CAN" statements in Future Present Tense** (`As an author / I CAN keep a catalog of my Works / So that …`), per the Lean-Agile MVP methodology. Not "I want …". A Scenario that refuses someone for _who they are_ (not for what they sent) is an "I CANNOT" Zero-Trust Scenario and carries `@zero-trust`; this single-user app has none yet.
- **Work test-first:** `.feature` files and specs are written and committed red before the code that makes them green.
- **Work on `dev`.** Cut branches from `dev` with `mvp scm.branch.open`; `main` and `dev` are protected (`.githooks`).
