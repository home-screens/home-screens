import type { APIRequestContext, Locator, Page } from '@playwright/test';
import { test, expect } from '../fixtures';
import { baseConfig, makeScreen } from '../helpers/config-fixtures';
import { renderOnDisplay } from '../helpers/display';
import { buildModuleInstance } from '../helpers/module-fixtures';
import { E2E_NOTE_MEMBERS, seedNotes } from '../helpers/api';
import type { Note } from '@/types/notes';

/**
 * Typing a note on the wall: a Notes card with writing on opens the note
 * sheet on a box and the wall's keyboard, and a card with drawing on too
 * offers both behind one "Leave a note" button. These drive the loop on a
 * real display: type, say who it is from, see the words on the card and in
 * the store, Undo. What the hub takes from a wall's token is unit-tested
 * beside the route (`api/notes/__tests__/route.test.ts`).
 */

async function board(request: APIRequestContext): Promise<Note[]> {
  const res = await request.get('/api/notes?live=1');
  return ((await res.json()) as { notes: Note[] }).notes;
}

/** Tap the words out on the wall's keyboard. Shift lights itself at the start of a sentence, so the first letter is a capital. */
async function typeWords(sheet: Locator, words: string): Promise<void> {
  for (const char of words) {
    await sheet.locator(`[data-testid="wall-keyboard"] [data-key="${char === ' ' ? 'space' : char}"]`).click();
  }
}

async function openSheet(page: Page, card: Locator): Promise<Locator> {
  await card.getByTestId('note-draw-door').click();
  const sheet = page.getByTestId('note-draw-sheet');
  await expect(sheet).toBeVisible();
  return sheet;
}

/** The sheet's own panel, which says which step and which side is showing. */
const panel = (sheet: Locator) => sheet.locator('[data-step]');
const field = (sheet: Locator) => sheet.getByTestId('note-write-field-words');
const nextKey = (sheet: Locator) => sheet.locator('[data-testid="wall-keyboard"] [data-key="action"]');

test('write a note, say who it is from, see it on the board, and Undo hands the words back', async ({ page, request, sandboxDir }) => {
  seedNotes(sandboxDir);
  const notes = buildModuleInstance('notes', { view: 'board', wallDraw: false, wallWrite: true });
  const display = await renderOnDisplay(page, request, baseConfig({ screens: [makeScreen('s1', 'S1', [notes])] }));
  const card = display.module('notes');
  const before = (await board(request)).length;
  await expect(card.getByTestId('note-draw-door')).toHaveText('Write a note');

  const sheet = await openSheet(page, card);
  // Only writing is on offer: the keyboard, no page and no switch.
  await expect(panel(sheet)).toHaveAttribute('data-mode', 'write');
  await expect(sheet.getByTestId('note-mode')).toHaveCount(0);
  await expect(sheet.getByTestId('note-draw-canvas')).toHaveCount(0);
  // Nothing typed: Next is faint and goes nowhere.
  await expect(nextKey(sheet)).toHaveAttribute('aria-disabled', 'true');
  // Forced: the test runner will not click a key marked disabled, and a finger can.
  await nextKey(sheet).click({ force: true });
  await expect(panel(sheet)).toHaveAttribute('data-step', 'draw');

  await typeWords(sheet, 'Back at five');
  await expect(field(sheet)).toContainText('Back at five');
  await nextKey(sheet).click();
  await expect(panel(sheet)).toHaveAttribute('data-step', 'who');
  await expect(sheet.getByTestId('note-write-preview')).toHaveText('Back at five');
  // Back to the words and on again: nothing typed is lost.
  await sheet.getByTestId('note-draw-back').click();
  await expect(field(sheet)).toContainText('Back at five');
  await nextKey(sheet).click();

  await expect(sheet.getByTestId('note-draw-post')).toBeDisabled();
  await sheet.locator(`[data-testid="note-draw-face"][data-member="${E2E_NOTE_MEMBERS.sam.id}"]`).click();
  await sheet.getByTestId('note-draw-life-12h').click();
  await sheet.getByTestId('note-draw-post').click();

  await expect(page.getByTestId('note-draw-sheet')).toHaveCount(0);
  await expect(page.getByTestId('note-posted-notice')).toContainText(E2E_NOTE_MEMBERS.sam.name);
  await expect.poll(async () => (await board(request)).length).toBe(before + 1);
  const written = (await board(request)).find((n) => n.text === 'Back at five')!;
  expect(written).toMatchObject({ authorId: E2E_NOTE_MEMBERS.sam.id, life: '12h', pinned: false, important: false });
  expect(written.drawing).toBeUndefined();
  await expect(card).toContainText('Back at five');

  // Undo takes it off the board and keeps the words: the button offers to finish them.
  await page.getByTestId('note-posted-undo').click();
  await expect(page.getByTestId('note-posted-notice')).toHaveCount(0);
  await expect.poll(async () => (await board(request)).some((n) => n.text === 'Back at five')).toBe(false);
  await expect(card.getByTestId('note-draw-door')).toHaveText('Finish your note');
  const again = await openSheet(page, card);
  await expect(field(again)).toContainText('Back at five');
});

test('a card with drawing and writing on: one button, a Draw / Write switch, and each side keeps what is on it', async ({ page, request, sandboxDir }) => {
  seedNotes(sandboxDir);
  const notes = buildModuleInstance('notes', { view: 'sticky', wallDraw: true, wallWrite: true });
  const display = await renderOnDisplay(page, request, baseConfig({ screens: [makeScreen('s1', 'S1', [notes])] }));
  const card = display.module('notes');
  await expect(card.getByTestId('note-draw-door')).toHaveText('Leave a note');

  const sheet = await openSheet(page, card);
  // Opens on the page; the tail of the opening tap is ignored there.
  await expect(panel(sheet)).toHaveAttribute('data-mode', 'draw');
  await page.waitForTimeout(450);
  const canvas = sheet.getByTestId('note-draw-page');
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.7, { steps: 5 });
  await page.mouse.up();
  await expect(sheet.getByTestId('note-draw-canvas')).toHaveAttribute('data-lines', '1');

  await sheet.getByTestId('note-mode-write').click();
  await expect(panel(sheet)).toHaveAttribute('data-mode', 'write');
  await typeWords(sheet, 'Feed the cat');
  await sheet.getByTestId('note-mode-draw').click();
  await expect(sheet.getByTestId('note-draw-canvas')).toHaveAttribute('data-lines', '1');
  await sheet.getByTestId('note-mode-write').click();
  await expect(field(sheet)).toContainText('Feed the cat');

  // The side showing is what goes up: the words, as nobody in particular.
  await nextKey(sheet).click();
  await sheet.locator('[data-testid="note-draw-face"][data-member=""]').click();
  await sheet.getByTestId('note-draw-post').click();
  await expect(page.getByTestId('note-draw-sheet')).toHaveCount(0);
  await expect.poll(async () => (await board(request)).some((n) => n.text === 'Feed the cat' && !n.drawing && !n.authorId)).toBe(true);
  expect((await board(request)).some((n) => n.drawing)).toBe(false);
  // The page that did not go up waits on the button, and the wall says so.
  await expect(page.getByTestId('note-posted-detail')).toHaveText('Your drawing is still waiting for you.');
  await expect(card.getByTestId('note-draw-door')).toHaveText('Finish your drawing');

  // Throwing words away throws away the words only: the page is still waiting.
  await page.waitForTimeout(1600);
  const again = await openSheet(page, card);
  await again.getByTestId('note-mode-write').click();
  await typeWords(again, 'Oops');
  await again.getByTestId('note-draw-close').click();
  await expect(again.getByTestId('note-draw-ask')).toContainText('Throw this note away?');
  await again.getByTestId('note-draw-throw').click();
  await expect(page.getByTestId('note-draw-sheet')).toHaveCount(0);
  await expect(card.getByTestId('note-draw-door')).toHaveText('Finish your drawing');
});

test('Close with words typed asks first, and a hub that does not answer keeps them in the sheet', async ({ page, request, sandboxDir }) => {
  seedNotes(sandboxDir);
  const notes = buildModuleInstance('notes', { view: 'whiteboard', wallDraw: false, wallWrite: true });
  const display = await renderOnDisplay(page, request, baseConfig({ screens: [makeScreen('s1', 'S1', [notes])] }));
  const card = display.module('notes');

  const sheet = await openSheet(page, card);
  await typeWords(sheet, 'Gone out');
  await sheet.getByTestId('note-draw-close').click();
  await expect(sheet.getByTestId('note-draw-ask')).toContainText('Throw this note away?');
  await sheet.getByTestId('note-draw-keep').click();
  await expect(field(sheet)).toContainText('Gone out');

  await nextKey(sheet).click();
  await sheet.locator('[data-testid="note-draw-face"][data-member=""]').click();
  await page.route('**/api/notes', (route) => (route.request().method() === 'POST' ? route.abort() : route.fallback()));
  await sheet.getByTestId('note-draw-post').click();
  await expect(sheet.getByTestId('note-draw-problem')).toContainText('Your note is still here');
  await expect(sheet.getByTestId('note-draw-post')).toHaveText('Try again');
  await page.unroute('**/api/notes');

  // Close from step two goes back to the words with the question; throwing them away forgets them.
  await sheet.getByTestId('note-draw-close').click();
  await sheet.getByTestId('note-draw-throw').click();
  await expect(page.getByTestId('note-draw-sheet')).toHaveCount(0);
  await expect(card.getByTestId('note-draw-door')).toHaveText('Write a note');
  expect((await board(request)).some((n) => n.text === 'Gone out')).toBe(false);
});

test('a tap on a typed note opens it large with every word, from a card that shows only part of it', async ({ page, request, sandboxDir }) => {
  const long = 'Mia has piano at four today, dinner is in the oven, and please remember that the bins go out tonight before anyone goes up to bed';
  seedNotes(sandboxDir, { members: [E2E_NOTE_MEMBERS.sam, E2E_NOTE_MEMBERS.riley], notes: [{ text: long, authorId: E2E_NOTE_MEMBERS.sam.id, ageMinutes: 5 }] });
  const notes = buildModuleInstance('notes', { view: 'board', wallDraw: false, wallWrite: true });
  const display = await renderOnDisplay(page, request, baseConfig({ screens: [makeScreen('s1', 'S1', [notes])] }));
  const card = display.module('notes');
  const row = card.getByTestId('notes-note').first();
  await expect(row).toContainText('Mia has piano');

  await row.click();
  const large = page.getByTestId('note-drawing-overlay');
  await expect(large).toContainText(E2E_NOTE_MEMBERS.sam.name);
  await expect(large.getByTestId('note-words-large')).toHaveText(long);
  // Every word is on the screen: the box is not cut off or scrolled.
  const fits = await large.getByTestId('note-words-large').evaluate((el) => el.scrollHeight <= el.clientHeight + 1);
  expect(fits).toBe(true);
  await page.getByTestId('note-drawing-overlay-close').click();
  await expect(large).toHaveCount(0);

  // The card's own button still opens the sheet, not the note above it.
  await page.waitForTimeout(1600);
  await card.getByTestId('note-draw-door').click();
  await expect(page.getByTestId('note-draw-sheet')).toBeVisible();
  await expect(page.getByTestId('note-drawing-overlay')).toHaveCount(0);
});
