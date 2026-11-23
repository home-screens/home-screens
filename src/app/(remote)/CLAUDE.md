# Phone surfaces (`/remote`, `/chores`)

Detail for work on the phone pages; the root `CLAUDE.md` has the project-wide rules.

## Building blocks

Phone pieces live in `src/app/(remote)/remote/components/`:
- Overlays: every sheet through `SheetFrame` (`BottomSheet`, `TallSheet`, `ConfirmSheet` with its `tone`), full-screen forms through `FormOverlay`, stacked by name from `REMOTE_LAYERS` (`remote-layers.ts`), never a number.
- Actions: `PrimaryButton` for every save, add or send (amber with dark ink), `SaveDeleteFooter` under a form, `DANGER_BUTTON` for a delete, `IconButton`, `ChipButton`, `PhoneSwitch`, `PersonChip`, `PhoneIconPicker` (`src/components/custom-icons/`).
- Pages: `TabHeader` (with `GearButton`), `SegmentedTabs`, `EmptyState`, `LoadFailed` (`RetryButton.tsx`), `TickRow`, `PhoneSpinner`, `showToast` (`remote-toast.ts`).
- Colours from `remote-styles.ts` or `var(--hs-*)`: `REMOTE_ACCENT` is the amber fill, `REMOTE_ACCENT_INK` amber as words or a thin line, `REMOTE_ON_ACCENT` ink on amber, `selectedPillStyle` / `toggleChipStyle` for a chosen chip.
