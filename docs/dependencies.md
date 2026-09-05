# Dependency policy

`package.json` and `package-lock.json` are the only Node dependency manifests. Use `npm ci` for reproducible installs and `npm install <package>@<version>` when intentionally changing the lockfile. The repository targets Node `>=20.19.0`; Node 22 LTS is the normal development and release runtime.

## Runtime packages

- `hono` is the Worker router and middleware layer.
- `preact` is the browser UI runtime.
- `cytoscape` powers the lazy-loaded Atlas graph and must stay outside the base client chunk.
- `ts-fsrs` owns FSRS scheduling calculations. Scheduler behavior must not be reimplemented locally.

Everything else is a development or operator dependency. Before adding a runtime package, prefer the platform API or an existing focused helper and confirm its client or Worker bundle cost.

## Intentional development-only consumers

Knip ignores three packages that have real consumers outside its static project graph:

- `@mozilla/readability` and `jsdom` are loaded by the installed Hermes Lite Visual extraction scripts through this repository's package resolution.
- `@types/cytoscape` supplies ambient type declarations for the Atlas integration.

Do not remove these as "unused" without checking the installed Hermes extraction path and the Atlas typecheck. Keep the matching comments and `ignoreDependencies` list in `knip.json` synchronized.

## Version holds

The 2026-09-05 Ponytail simplification audit found no unused packages or audit vulnerabilities. Nine packages have available updates (`@cloudflare/workers-types`, `@types/node`, `eslint`, `globals`, `hono`, `playwright`, `ts-fsrs`, `typescript`, and `wrangler`); the existing toolchain holds below still apply. No dependency or lockfile change was needed for the cleanup. Ponytail's six instruction-only skills are installed outside this repository and add no application runtime dependency.

The 2026-09-05 scoped-material notebook fix also retains the lockfile and adds no packages. Its audit reports zero vulnerabilities; the same updates below, plus Playwright 1.63, remain deferred to a dedicated toolchain update.

The 2026-09-05 Threads redesign uses the existing lockfile and adds no dependencies. `npm audit` reports zero vulnerabilities. Newer releases of the Cloudflare types, Node types, ESLint, globals, Hono, ts-fsrs, TypeScript, and Wrangler are available; their upgrades remain a separate dependency change so this UI release does not alter the Worker, scheduler, or compiler baseline.

TypeScript is held on the current 6.x line because the installed `typescript-eslint` release declares support through TypeScript 6.x, not 7.x. Upgrade TypeScript 7 only after the lint toolchain declares compatible peer support and the complete typecheck, unit, build, and E2E gates pass. This is a compatibility hold, not an invitation to ignore other updates.

Vite 8 uses Rolldown configuration under `build.rolldownOptions`. Do not restore the removed Rollup object-form `manualChunks` configuration; use the function form in `vite.config.ts` and verify the base bundle budget after upgrades.

## Install-script policy

npm dependency lifecycle scripts are denied unless explicitly listed in `package.json#allowScripts`. The current allow-list contains only the pinned `esbuild` and `workerd` packages required by Vite and Wrangler. Review package ownership, the resolved version, and the script before changing this list. Never approve all pending scripts as a shortcut.

## Upgrade procedure

1. Run `npm outdated` and `npm audit` and read the upstream migration notes for major updates.
2. Upgrade the smallest related package group and review the lockfile for unexpected packages or new lifecycle scripts.
3. Run `npm run quality`, `npm test`, `npm run build`, and `npm run test:e2e`.
4. For Worker or Wrangler changes, run migration rehearsal and the release gate. For UI build changes, inspect the emitted gzip sizes and preserve the 150 KB base-client limit.
5. Update this file for a new hold or ownership exception and add the reason to `CHANGELOG.md`.

Remove packages as soon as their last real consumer is removed. `npm run dead-code` is the checked-in reachability gate for unused files, dependencies, and unlisted imports.
