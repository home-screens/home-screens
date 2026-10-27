import { test, expect } from '../fixtures';
import type { APIRequestContext, Page } from '@playwright/test';
import { putConfig, seedNotes, E2E_NOTE_MEMBERS } from '../helpers/api';
import { confirmSheet } from '../helpers/remote';
import { baseConfig, makeScreen } from '../helpers/config-fixtures';
import { buildModuleInstance } from '../helpers/module-fixtures';
import type { Note } from '@/types/notes';

/**
 * /remote Notes tab: the family notes board in data/notes.json, driven
 * through the real NotesTab UI. What a write does to the store (limits, the
 * sweep, expiry from each preset) is covered by the unit tests beside
 * src/lib/notes-actions.ts and the route tests; these specs prove each phone
 * gesture reaches the store the wall reads.
 *
 * The tab is always on the bar and gated on a `notes` module existing on
 * some screen, the way Lists gates on a to-do list.
 */

const SAM = E2E_NOTE_MEMBERS.sam;
const RILEY = E2E_NOTE_MEMBERS.riley;
const DAY_MS = 24 * 60 * 60 * 1000;

async function getNotes(request: APIRequestContext): Promise<Note[]> {
  const res = await request.get('/api/notes');
  expect(res.ok()).toBe(true);
  return ((await res.json()) as { notes: Note[] }).notes;
}

async function onlyNote(request: APIRequestContext): Promise<Note> {
  const notes = await getNotes(request);
  expect(notes).toHaveLength(1);
  return notes[0];
}

async function openNotes(page: Page) {
  await page.goto('/remote');
  // exact: the tab bar's button is aria-label="Notes"; nothing else on the
  // Control tab may match a substring of it.
  await page.getByRole('button', { name: 'Notes', exact: true }).click();
}

const card = (page: Page, text: string) => page.getByTestId('notes-card').filter({ hasText: text });
const sheet = (page: Page) => page.getByTestId('notes-sheet');

test.beforeEach(async ({ request, sandboxDir }) => {
  await putConfig(request, baseConfig({
    screens: [makeScreen('s1', 'S1', [buildModuleInstance('notes')])],
  }));
  // An empty board and two people to sign notes with, whatever an earlier
  // test in this worker posted.
  seedNotes(sandboxDir, { members: [SAM, RILEY], notes: [] });
});

test('Notes is the fifth of seven tabs, between Lists and Meals', async ({ page }) => {
  await page.goto('/remote');
  const bar = page.locator('nav').filter({ has: page.getByRole('button', { name: 'Notes', exact: true }) });
  await expect(bar.getByRole('button')).toHaveText(['Control', 'Timers', 'Chores', 'Lists', 'Notes', 'Meals', 'Photos']);

  await bar.getByRole('button', { name: 'Notes', exact: true }).click();
  await expect(bar.getByRole('button', { name: 'Notes', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: 'Notes', exact: true })).toBeVisible();
  // An empty board says what to do, and the write bar is already there.
  await expect(page.getByTestId('notes-empty')).toContainText('Nothing on the board yet');
  await expect(page.getByTestId('notes-add-input')).toBeVisible();
});

test('without a notes module the tab explains what to add', async ({ page, request }) => {
  await putConfig(request, baseConfig({ screens: [makeScreen('s1', 'S1', [])] }));
  await openNotes(page);
  await expect(page.getByText('No notes board yet')).toBeVisible();
  await expect(page.getByText('Notes show up here once a Notes board is on one of your screens.')).toBeVisible();
  await expect(page.getByTestId('notes-add-input')).toHaveCount(0);
});

test('the write bar puts a note on the wall at once, for a day, from nobody', async ({ page, request }) => {
  await openNotes(page);
  const input = page.getByTestId('notes-add-input');
  await input.fill('Bring the library books back');
  await input.press('Enter');

  await expect(card(page, 'Bring the library books back')).toBeVisible();
  await expect(card(page, 'Bring the library books back')).toContainText('Someone');
  await expect(page.getByTestId('notes-on-wall')).toHaveText('1 on the wall');
  await expect(input).toHaveValue('');

  await expect.poll(async () => (await getNotes(request)).map((n) => n.text)).toEqual(['Bring the library books back']);
  const saved = await onlyNote(request);
  expect(saved).toMatchObject({ life: '1d', pinned: false, important: false });
  expect(saved.authorId).toBeUndefined();
  expect(Date.parse(saved.expiresAt!) - Date.parse(saved.createdAt)).toBe(DAY_MS);
});

test('the sheet posts a pinned, important note from someone, and the phone remembers who', async ({ page, request }) => {
  await openNotes(page);
  // The plus opens the sheet with whatever was typed carried in.
  await page.getByTestId('notes-add-input').fill('Swim bag by the door');
  await page.getByTestId('notes-add-submit').click();
  await expect(sheet(page)).toBeVisible();
  await expect(sheet(page).getByTestId('notes-sheet-text')).toHaveValue('Swim bag by the door');

  await sheet(page).getByTestId('notes-sheet-author').getByRole('button', { name: RILEY.name }).click();
  await expect(sheet(page).getByTestId('notes-sheet-author').getByRole('button', { name: RILEY.name })).toHaveAttribute('aria-pressed', 'true');
  await sheet(page).getByTestId('notes-sheet-life').getByRole('button', { name: '3 days' }).click();
  await sheet(page).getByTestId('notes-sheet-pin').click();
  await sheet(page).getByTestId('notes-sheet-important').click();
  await expect(sheet(page).getByTestId('notes-sheet-important')).toHaveAttribute('aria-pressed', 'true');
  await sheet(page).getByTestId('notes-sheet-submit').click();
  await expect(sheet(page)).toHaveCount(0);

  const posted = card(page, 'Swim bag by the door');
  await expect(posted).toBeVisible();
  await expect(posted).toHaveAttribute('data-important', 'true');
  await expect(posted).toHaveAttribute('data-pinned', 'true');
  await expect(posted).toContainText(RILEY.name);
  await expect(posted).toContainText('Important');
  await expect(posted.getByTestId('notes-time-left')).toContainText('Pinned');

  await expect.poll(async () => (await getNotes(request)).length).toBe(1);
  const saved = await onlyNote(request);
  expect(saved).toMatchObject({ text: 'Swim bag by the door', authorId: RILEY.id, life: '3d', pinned: true, important: true });
  expect(Date.parse(saved.expiresAt!) - Date.parse(saved.createdAt)).toBe(3 * DAY_MS);

  // The next quick post from the bar is signed by whoever posted last.
  const input = page.getByTestId('notes-add-input');
  await input.fill('Out of milk');
  await input.press('Enter');
  await expect(card(page, 'Out of milk')).toContainText(RILEY.name);
  await expect.poll(async () => (await getNotes(request)).find((n) => n.text === 'Out of milk')?.authorId).toBe(RILEY.id);
});

test('tapping a card opens it for editing, and Save changes the text but not when it was posted', async ({ page, request, sandboxDir }) => {
  seedNotes(sandboxDir, { notes: [{ id: 'grandma', text: 'Grandma visits on Friday', authorId: SAM.id, life: '3d', ageMinutes: 90 }] });
  const before = await onlyNote(request);
  await openNotes(page);

  await page.getByRole('button', { name: `Edit note from ${SAM.name}` }).click();
  await expect(sheet(page)).toBeVisible();
  await expect(sheet(page).getByTestId('notes-sheet-text')).toHaveValue('Grandma visits on Friday');
  await expect(sheet(page).getByTestId('notes-sheet-author').getByRole('button', { name: SAM.name })).toHaveAttribute('aria-pressed', 'true');
  await expect(sheet(page).getByTestId('notes-sheet-life').getByRole('button', { name: '3 days' })).toHaveAttribute('aria-pressed', 'true');
  await expect(sheet(page)).toContainText('Counted from when the note was posted.');

  await sheet(page).getByTestId('notes-sheet-text').fill('Grandma visits on Saturday');
  await sheet(page).getByTestId('notes-sheet-submit').click();

  await expect(card(page, 'Grandma visits on Saturday')).toBeVisible();
  await expect(card(page, 'Grandma visits on Friday')).toHaveCount(0);
  await expect.poll(async () => (await onlyNote(request)).text).toBe('Grandma visits on Saturday');
  const after = await onlyNote(request);
  // Only a new life moves the expiry; a text edit leaves the note's time alone.
  expect(after).toMatchObject({ id: 'grandma', createdAt: before.createdAt, expiresAt: before.expiresAt, authorId: SAM.id });
});

test('Take it down moves a note to Gone, and Post again puts it back up', async ({ page, request, sandboxDir }) => {
  seedNotes(sandboxDir, { notes: [{ id: 'dentist', text: 'Dentist at four today', authorId: RILEY.id, important: true, life: '1d', ageMinutes: 120 }] });
  const before = await onlyNote(request);
  await openNotes(page);

  await card(page, 'Dentist at four today').click();
  await sheet(page).getByTestId('notes-sheet-take-down').click();
  await expect(sheet(page)).toHaveCount(0);

  await expect(card(page, 'Dentist at four today')).toHaveCount(0);
  const toggle = page.getByTestId('notes-gone-toggle');
  await expect(toggle).toHaveText('Gone (1)');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect.poll(async () => Date.parse((await onlyNote(request)).expiresAt ?? '') <= Date.now()).toBe(true);

  await toggle.click();
  const row = page.getByTestId('notes-gone-row').filter({ hasText: 'Dentist at four today' });
  await expect(row).toBeVisible();
  await row.getByTestId('notes-repost').click();

  // Back on the wall as if posted just now, with its day starting over.
  await expect(card(page, 'Dentist at four today')).toBeVisible();
  await expect(card(page, 'Dentist at four today')).toHaveAttribute('data-important', 'true');
  await expect(page.getByTestId('notes-gone-toggle')).toHaveCount(0);
  await expect.poll(async () => Date.parse((await onlyNote(request)).expiresAt ?? '') > Date.now()).toBe(true);
  const after = await onlyNote(request);
  expect(after).toMatchObject({ text: before.text, authorId: RILEY.id, important: true, life: '1d' });
  expect(Date.parse(after.createdAt)).toBeGreaterThan(Date.parse(before.createdAt));
  expect(Date.parse(after.expiresAt!) - Date.parse(after.createdAt)).toBe(DAY_MS);
});

test('Delete in Gone asks first, then removes the note for good', async ({ page, request, sandboxDir }) => {
  seedNotes(sandboxDir, { notes: [
    { id: 'old', text: 'Recycling went out', ageMinutes: 26 * 60, expiresInMinutes: -120 },
    { id: 'live', text: 'Pizza is in the fridge', ageMinutes: 30 },
  ] });
  await openNotes(page);
  await expect(card(page, 'Pizza is in the fridge')).toBeVisible();

  await page.getByTestId('notes-gone-toggle').click();
  const row = page.getByTestId('notes-gone-row').filter({ hasText: 'Recycling went out' });
  await row.getByTestId('notes-delete').click();

  // Cancel first: the note is still there.
  await expect(confirmSheet(page)).toContainText('Delete this note for good?');
  await expect(confirmSheet(page)).toContainText('Recycling went out');
  await confirmSheet(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(confirmSheet(page)).toHaveCount(0);
  await expect(row).toBeVisible();

  await row.getByTestId('notes-delete').click();
  await confirmSheet(page).getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(row).toHaveCount(0);
  await expect(page.getByTestId('notes-gone-toggle')).toHaveCount(0);
  await expect.poll(async () => (await getNotes(request)).map((n) => n.id)).toEqual(['live']);
});
