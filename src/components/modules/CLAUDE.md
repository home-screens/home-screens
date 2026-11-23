# Modules

Detail for work under `src/components/modules/`; the root `CLAUDE.md` has the project-wide rules.

## Adding a built-in module

Adding a built-in module touches these places, and the `meta` E2E project (`npx playwright test --project=meta`) names exactly which ones are still missing:

1. Component in `src/components/modules/`
2. Type added to the `BuiltinModuleType` union and a config interface in `src/types/config.ts`, with a JSDoc comment on every field (the first paragraph is shown on the website, so keep it plain; developer notes go after a blank line), then `npm run docs:schema`
3. Registry entry in `src/lib/module-registry.ts` (type, label, icon, category, `defaultConfig`, `defaultSize`; set `autoSizesText` if the component uses `useScaledFontSize` / `useFitFontSize`)
4. Dynamic import in `src/lib/module-components.ts`
5. Config section in `src/components/editor/config-sections/` (one file per module, exported from the barrel, dispatched in `PropertyPanel.tsx`)
6. Optional API route under `src/app/api/`
7. Fixture row in `e2e/helpers/module-fixtures.ts`; a JSON stub under `e2e/fixtures/module-data/` plus a `stubKey` if it fetches data; a `CONFIG_VARIANTS` row per config field (or a reasoned `FIELD_DECISIONS` entry in `e2e/meta/coverage.spec.ts`); an `EXTRA_DISCRIMINATORS` row or a `DISCRIMINATOR_UNION_DECISIONS` entry for any other string union its config uses; an `EMPTY_STATE_FIXTURES` row if it uses `ModuleEmptyState` / `LocationRequired` / `WeatherEmptyState`
8. A `buildModuleInstance('<type>')` field-edit case in `e2e/editor/config-editing.spec.ts`
9. If it declares a `*View` union: a `VIEW_MATRIX` row in `e2e/helpers/view-matrix.ts` (rendered by `e2e/display/module-views.spec.ts`) or a `SINGLE_VIEW_TESTED_MODULES` entry in `e2e/meta/coverage.spec.ts`

## Wall building blocks

In `src/components/modules/shared/`: `WallButton` for every tap target, `useWallSheet` / `WallOverlay` for a sheet, `FullscreenStateShell` / `fullscreenStateStyle` for a full-screen module's loading, setup and empty states, `ModuleTitleRow`, `MemberBadge`, `WallNotice`.
