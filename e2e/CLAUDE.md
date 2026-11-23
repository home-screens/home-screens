# E2E tests

Detail for work under `e2e/`; the root `CLAUDE.md` has the commands.

E2E is Playwright, Chromium only. Each worker boots its own production `next start` from a sandboxed cwd with a private `data/` (`e2e/helpers/sandbox.ts`), so runs never touch the real data. Specs reset state with `PUT /api/config` in `beforeEach`.

Module coverage is data-driven. `e2e/helpers/module-fixtures.ts` has one row per built-in type and the render matrices loop over it; config-field depth lives in `e2e/helpers/config-variants/`, empty states in `e2e/helpers/empty-state-fixtures.ts`, the style matrix in `e2e/display/module-style.spec.ts` (exemptions in `e2e/helpers/style-matrix.ts` carry a reason). Module data is fetched client-side and stubbed at the browser boundary by `stubModuleData` (`e2e/helpers/stubs.ts`), whose external-block catch-all guarantees zero real upstream calls. Local-data modules seed instead: `seedChores`, `seedMeals`, `seedTodos(sandboxDir)`; plugin specs use `seedFixturePlugin`. The ratchets in `e2e/meta/coverage.spec.ts` also police settings pages, API routes (`ROUTE_DECISIONS`), locales per surface, `autoSizesText` flags, style exemptions, every route's auth posture (`PUBLIC_ROUTES`), and agreement between a registry `defaultConfig` and the fallback the code renders or fetches with (`DEFAULT_FALLBACK_EXEMPTIONS`).
