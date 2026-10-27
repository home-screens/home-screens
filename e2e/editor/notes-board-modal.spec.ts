import { test, expect } from '../fixtures';
import type { Page } from '@playwright/test';
import { seedNotes, E2E_NOTE_MEMBERS, E2E_NOTE_TEXTS } from '../helpers/api';
import { buildModuleInstance } from '../helpers/module-fixtures';
import { selectModule } from '../helpers/editor';

/**
 * The editor's own door to the family notes board: the Notes section's
 * "Manage notes" opens a modal that writes `/api/notes` directly, and every
 * answer is handed to the canvas preview, so a change shows on the module
 * behind the modal without waiting for the next poll.
 */

type BoardNote = { id: string; text: string; authorId?: string; pinned: boolean; important: boolean; life: string; expiresAt: string | null };

async function openBoard(page: Page) {
  await page.getByRole('button', { name: 'Manage notes' }).click();
  const modal = page.getByTestId('notes-modal');
  await expect(modal).toBeVisible();
  // The three seeded notes are all on the wall.
  await expect(modal.getByTestId('notes-modal-row')).toHaveCount(3);
  return modal;
}

function noteWrite(page: Page, method: 'POST' | 'PATCH' | 'DELETE') {
  return page.waitForResponse((r) => new URL(r.url()).pathname.startsWith('/api/notes') && r.request().method() === method && r.ok());
}

test.describe('Notes board modal (editor-side notes)', () => {
  test('posting a note puts it on the board and on the canvas preview', async ({ page, request, sandboxDir }) => {
    seedNotes(sandboxDir);
    await selectModule(page, request, buildModuleInstance('notes'));
    const preview = page.locator('[data-module-id="notes-1"]');
    await expect(preview).toContainText(E2E_NOTE_TEXTS.pinned);
    await expect(preview).not.toContainText('Soccer moved to Saturday');

    const modal = await openBoard(page);
    await modal.getByTestId('notes-modal-text').fill('Soccer moved to Saturday');
    await expect(modal.getByText('24 / 500')).toBeVisible();
    await modal.getByTestId('notes-modal-author').selectOption({ label: E2E_NOTE_MEMBERS.riley.name });
    await modal.getByTestId('notes-modal-life').selectOption('3d');
    // Pinned and newest, so it leads the board and is never folded into "and N more".
    await modal.getByTestId('notes-modal-pin').getByRole('switch').click();

    const posted = noteWrite(page, 'POST');
    await modal.getByTestId('notes-modal-post').click();
    await posted;

    await expect(modal.getByTestId('notes-modal-row')).toHaveCount(4);
    await expect(modal.getByTestId('notes-modal-row').first().getByTestId('notes-modal-row-text')).toHaveValue('Soccer moved to Saturday');
    await expect(modal.getByTestId('notes-modal-text')).toHaveValue('');

    const board = (await (await request.get('/api/notes')).json()).notes as BoardNote[];
    expect(board.find((n) => n.text === 'Soccer moved to Saturday')).toMatchObject({
      authorId: E2E_NOTE_MEMBERS.riley.id,
      life: '3d',
      pinned: true,
      important: false,
    });

    // The preview behind the modal has the note already.
    await expect(preview).toContainText('Soccer moved to Saturday');
  });

  test('a row edit saves once and stays, and Take down, Post again and Delete run against the hub', async ({ page, request, sandboxDir }) => {
    seedNotes(sandboxDir);
    await selectModule(page, request, buildModuleInstance('notes'));
    const preview = page.locator('[data-module-id="notes-1"]');
    await expect(preview).toContainText(E2E_NOTE_TEXTS.pinned);

    const modal = await openBoard(page);
    const textPatches: string[] = [];
    page.on('request', (r) => {
      if (r.method() === 'PATCH' && new URL(r.url()).pathname === '/api/notes/e2e-note-plain') {
        const body = r.postDataJSON() as { text?: string };
        if (body.text !== undefined) textPatches.push(body.text);
      }
    });

    const plain = modal.locator('[data-note-id="e2e-note-plain"]');
    const field = plain.getByTestId('notes-modal-row-text');
    await field.fill('Pizza and salad are in the fridge');
    const saved = noteWrite(page, 'PATCH');
    await modal.getByRole('heading', { name: 'On the wall' }).click();
    await saved;
    // Long enough for a second debounced save to have gone out, had one been scheduled.
    await page.waitForTimeout(1200);
    expect(textPatches).toEqual(['Pizza and salad are in the fridge']);
    await expect(field).toHaveValue('Pizza and salad are in the fridge');
    let board = (await (await request.get('/api/notes')).json()).notes as BoardNote[];
    expect(board.find((n) => n.id === 'e2e-note-plain')?.text).toBe('Pizza and salad are in the fridge');

    // Take it down: it leaves the wall list, the preview and the hub's live board.
    const takenDown = noteWrite(page, 'PATCH');
    await plain.getByTestId('notes-modal-take-down').click();
    await takenDown;
    await expect(modal.getByTestId('notes-modal-row')).toHaveCount(2);
    await expect(preview).not.toContainText('Pizza and salad are in the fridge');
    const live = (await (await request.get('/api/notes?live=1')).json()).notes as BoardNote[];
    expect(live.map((n) => n.id)).not.toContain('e2e-note-plain');

    // Gone is folded until asked for.
    const goneToggle = modal.getByTestId('notes-modal-gone-toggle');
    await expect(goneToggle).toHaveText('Gone (1)');
    await expect(goneToggle).toHaveAttribute('aria-expanded', 'false');
    await goneToggle.click();
    const goneRow = modal.locator('[data-testid="notes-modal-gone-row"][data-note-id="e2e-note-plain"]');
    await expect(goneRow).toBeVisible();

    // Post again: back on the wall.
    const reposted = noteWrite(page, 'PATCH');
    await goneRow.getByTestId('notes-modal-repost').click();
    await reposted;
    await expect(modal.getByTestId('notes-modal-row')).toHaveCount(3);
    await expect(goneToggle).toBeHidden();

    // Take it down again and delete it, past the confirm.
    const downAgain = noteWrite(page, 'PATCH');
    await plain.getByTestId('notes-modal-take-down').click();
    await downAgain;
    // Gone stays open from before: it folds only when asked to.
    await expect(modal.getByTestId('notes-modal-gone-toggle')).toHaveAttribute('aria-expanded', 'true');
    await goneRow.getByTestId('notes-modal-delete').click();
    const deleted = noteWrite(page, 'DELETE');
    await page.getByRole('dialog', { name: 'Delete note' }).getByRole('button', { name: 'Delete', exact: true }).click();
    await deleted;
    await expect(modal.getByTestId('notes-modal-gone-toggle')).toBeHidden();
    board = (await (await request.get('/api/notes')).json()).notes as BoardNote[];
    expect(board.map((n) => n.id)).not.toContain('e2e-note-plain');
    expect(board).toHaveLength(2);
  });
});
