import { test, expect } from '../fixtures';
import type { APIRequestContext, Page } from '@playwright/test';
import { baseConfig, makeScreen } from '../helpers/config-fixtures';
import { putConfig, seedNotes, notesSeed, E2E_NOTE_MEMBERS, E2E_NOTE_TEXTS, type NotesSeed } from '../helpers/api';
import { buildModuleInstance, matrixSettings } from '../helpers/module-fixtures';

/**
 * A notes wall reads the board when it changes, not on a timer: the
 * heartbeat names the board's revision (the ETag `GET /api/notes` answers
 * with), and the wall reads `?live=1` again only when that moves. Expiry is
 * the other half: a note's time running out changes no file, so the wall
 * retires it on its own minute tick from the `expiresAt` every answer
 * carries.
 */

async function setUp(request: APIRequestContext, sandboxDir: string, seed: NotesSeed = notesSeed()) {
  seedNotes(sandboxDir, seed);
  const board = buildModuleInstance('notes', { maxNotes: 10 });
  board.id = 'board';
  await putConfig(request, baseConfig({ screens: [makeScreen('s1', 'S1', [board])], settings: matrixSettings() }));
}

/** Every GET the wall makes to the notes board. */
function watchNoteReads(page: Page): string[] {
  const reads: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (request.method() === 'GET' && url.pathname === '/api/notes') reads.push(url.pathname + url.search);
  });
  return reads;
}

/** Resolves after `count` more heartbeats have been answered. */
async function beats(page: Page, count: number) {
  for (let i = 0; i < count; i++) {
    await page.waitForResponse((r) => new URL(r.url()).pathname === '/api/display/commands', { timeout: 10_000 });
  }
}

test.describe('a notes wall follows the heartbeat', () => {
  // Each test watches several 3 s beats go by.
  test.describe.configure({ timeout: 60_000 });

  test('reads the board as it mounts, then nothing while nothing changes', async ({ page, request, sandboxDir }) => {
    await setUp(request, sandboxDir);
    const reads = watchNoteReads(page);
    await page.goto('/display');
    const board = page.locator('[data-module-id="board"]');
    await expect(board).toContainText(E2E_NOTE_TEXTS.pinned);
    await beats(page, 1);
    const settled = reads.length;
    expect(settled, 'the wall should have read the board as it mounted').toBeGreaterThan(0);
    expect(reads.every((r) => r === '/api/notes?live=1'), `the wall reads live notes only: ${reads.join(', ')}`).toBe(true);

    // Four beats (12 s) with the board unchanged: the beats name the ETag the
    // wall already holds, so nothing is read again.
    await beats(page, 4);
    expect(reads.slice(settled)).toEqual([]);
  });

  test('a note posted from a phone is on the wall within a few beats, with no reload', async ({ page, request, sandboxDir }) => {
    await setUp(request, sandboxDir);
    const loads: string[] = [];
    page.on('load', () => loads.push(page.url()));
    await page.goto('/display');
    const board = page.locator('[data-module-id="board"]');
    await expect(board.getByTestId('notes-note')).toHaveCount(3);
    await beats(page, 1);

    const reread = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/notes' && r.request().method() === 'GET' && r.status() === 200);
    const posted = await request.post('/api/notes', { data: { text: 'Soccer moved to five', authorId: E2E_NOTE_MEMBERS.riley.id } });
    expect(posted.ok(), `POST /api/notes answered ${posted.status()}`).toBe(true);
    await reread;

    const note = board.getByTestId('notes-note').filter({ hasText: 'Soccer moved to five' });
    await expect(note).toBeVisible({ timeout: 8_000 });
    await expect(note).toContainText(E2E_NOTE_MEMBERS.riley.name);
    await expect(board.getByTestId('notes-note')).toHaveCount(4);
    expect(loads, 'the wall must pick the note up without reloading').toHaveLength(1);
  });

  test('a note leaves the wall on its own clock when its time is up', async ({ page, request, sandboxDir }) => {
    await setUp(request, sandboxDir, { notes: [
      { id: 'stays', text: 'Feed the cat', life: 'keep', ageMinutes: 30 },
      { id: 'leaves', text: 'Back in a minute', ageMinutes: 5, expiresInMinutes: 1.5 },
      { id: 'gone', text: 'Already came down', ageMinutes: 60, expiresInMinutes: -1 },
    ] });
    await page.clock.install();
    await page.goto('/display');
    const board = page.locator('[data-module-id="board"]');
    await expect(board).toContainText('Feed the cat');
    await expect(board).toContainText('Back in a minute');
    // Gone before the wall ever drew: never shown.
    await expect(board).not.toContainText('Already came down');

    // Two minutes on, the way a closed laptop lid would pass them: the file
    // has not changed, so only the wall's own minute tick can retire it.
    await page.clock.fastForward('02:00');
    await expect(board).not.toContainText('Back in a minute');
    await expect(board).toContainText('Feed the cat');
    await expect(board.getByTestId('notes-note')).toHaveCount(1);
  });
});

test.describe('the notes read revalidates', () => {
  test('an unchanged board is a 304, a changed one is sent again, and the heartbeat names the same ETag', async ({ request, sandboxDir }) => {
    seedNotes(sandboxDir);

    const first = await request.get('/api/notes?live=1');
    expect(first.status()).toBe(200);
    const etag = first.headers()['etag'];
    expect(etag).toMatch(/^"[0-9a-f]{24}"$/);
    const again = await request.get('/api/notes?live=1', { headers: { 'If-None-Match': etag } });
    expect(again.status()).toBe(304);
    expect(await again.body()).toHaveLength(0);

    const { revisions } = await (await request.get('/api/display/revisions')).json() as { revisions: { notes?: string } };
    expect(revisions.notes).toBe(etag);

    expect((await request.post('/api/notes', { data: { text: 'A new note' } })).ok()).toBe(true);
    const changed = await request.get('/api/notes?live=1', { headers: { 'If-None-Match': etag } });
    expect(changed.status()).toBe(200);
    expect(changed.headers()['etag']).not.toBe(etag);
    expect(((await changed.json()) as { notes: Array<{ text: string }> }).notes.map((n) => n.text)).toContain('A new note');
  });
});
