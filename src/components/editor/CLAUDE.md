# Editor

Detail for work on the editor; the root `CLAUDE.md` has the project-wide rules.

## Building blocks

Editor pieces live in `src/components/ui/` unless named:
- Windows: `ModalFrame` with `ModalPanel` / `ModalHeader` / `ModalBody` / `ModalFooter` (`editor/CRUDModalShell.tsx` for list windows); questions through `useConfirmStore().confirm`, always with `confirmLabel` and `variant`.
- Feedback: `Toast` (one `ToastStack` in the editor layout), `Notice` for a tinted box, `StatusDot`, `StatusPill`, `IconButton`, `Spinner` / `LoadingLine`.
- Fields: `FieldHint` for a help line (`hint` on `LabeledField` / `LabeledInput` / `LabeledSelect` / `Slider`), the tiers in `input-classes.ts` (`INPUT_CLASS` in the property panel, `SETTINGS_INPUT_CLASS` / `SETTINGS_INPUT_SM_CLASS` on Settings pages, `MODAL_INPUT_CLASS` in windows) with `CHECKBOX_CLASS` for every checkbox and radio, `Toggle` (with `description`) or `Switch`, `SegmentedControl` for pick-one, `ColorPicker` with `swatches` for an accent, `ScheduleWindowFields` (`editor/ScheduleWindowFields.tsx`) for every day-and-time window (a module's or screen's schedule, a time condition, a profile's schedule).
- Copy and sign-in: `useCopyFlash` (`src/hooks/useCopyFlash.ts`) behind every Copy button, `DeviceCodeLink` / `DeviceCodeButton` (`editor/DeviceCodeParts.tsx`) for a sign-in whose code is typed on another device.
- Headings: `SettingsSectionHeading` / `SettingsSubHeading` (`editor/settings/shared/SettingsPanel.tsx`), `SectionHeading` for property-panel groups, `SettingsTabBar` (`editor/settings/shared/SettingsTabBar.tsx`) for a Settings page split into tabs.
- Colours are `hs-*` tokens only; no Tailwind palette classes.

## Settings

Settings is split into **Defaults** (shared values, pages listed in `DEFAULT_PAGE_IDS`) and **Per display** (one page per display, every field an `OverrideRow` with explicit Override / Reset). `src/lib/settings-route.ts` parses and canonicalizes the settings URL and maps retired ids. `src/lib/display-defaults-backlinks.ts` tells a Defaults page which displays override its fields.
