import type { Locator, Page } from '@playwright/test';

/**
 * The two /remote overlays whose buttons deliberately share their trigger's
 * wording: `FormOverlay`'s save reads "Add Member" / "Add Chore" like the
 * button that opened it, and `ConfirmSheet`'s confirm reads "Delete Chore" /
 * "Redeem …" like the control that raised it.
 *
 * Addressing those by label alone (`getByRole('button', …).last()`) is a race,
 * not a selector: for the render between the trigger's click and React's
 * commit only ONE button matches, so `.last()` resolves to the trigger and
 * clicks it again, the sheet never confirms, and the spec fails much later on
 * a store read that never changed. Scoping through these locators makes
 * Playwright wait for the overlay instead of guessing.
 */
export function confirmSheet(page: Page): Locator {
  return page.getByTestId('confirm-sheet');
}

export function formOverlay(page: Page): Locator {
  return page.getByTestId('form-overlay');
}
