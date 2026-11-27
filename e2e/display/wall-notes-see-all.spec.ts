import { test, expect } from '../fixtures';
import { baseConfig, makeScreen } from '../helpers/config-fixtures';
import { renderOnDisplay } from '../helpers/display';
import { buildModuleInstance } from '../helpers/module-fixtures';
import { E2E_NOTE_TEXTS, seedNotes } from '../helpers/api';

/**
 * "and N more" on a wall's Notes card: the notes the card left out are one
 * tap away. The line is a button that opens every note in a sheet, a note
 * there opens large, and Close on the note comes back to the list.
 */
for (const view of ['board', 'notebook'] as const) {
  test(`${view}: "and 2 more" opens every note, and a note opens from the list`, async ({ page, request, sandboxDir }) => {
    seedNotes(sandboxDir);
    const notes = buildModuleInstance('notes', { view, maxNotes: 1 });
    const display = await renderOnDisplay(page, request, baseConfig({ screens: [makeScreen('s1', 'S1', [notes])] }));
    const card = display.module('notes');
    await expect(card.getByTestId('notes-note')).toHaveCount(1);

    await card.getByTestId('notes-more').click();
    const sheet = page.getByTestId('notes-all-sheet');
    const rows = sheet.getByTestId('notes-all-note');
    await expect(rows).toHaveCount(3);
    for (const text of Object.values(E2E_NOTE_TEXTS)) await expect(sheet).toContainText(text);

    // A note opens large on top of the list, and Close there comes back to it.
    await rows.filter({ hasText: E2E_NOTE_TEXTS.plain }).click();
    const large = page.getByTestId('note-drawing-overlay');
    await expect(large.getByTestId('note-words-large')).toHaveText(E2E_NOTE_TEXTS.plain);
    await large.getByTestId('note-drawing-overlay-close').click();
    await expect(large).toHaveCount(0);
    await expect(rows).toHaveCount(3);

    // The two Close buttons sit near each other, and a second tap that near and that soon counts
    // as a double tap on the first and is ignored, so the tap is tried until it is taken.
    await expect(async () => {
      await sheet.getByTestId('notes-all-close').click({ timeout: 1000 });
      await expect(sheet).toHaveCount(0, { timeout: 500 });
    }).toPass();
  });
}
