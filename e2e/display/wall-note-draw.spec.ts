import type { APIRequestContext, Locator, Page } from '@playwright/test';
import { test, expect } from '../fixtures';
import { baseConfig, makeScreen } from '../helpers/config-fixtures';
import { renderOnDisplay } from '../helpers/display';
import { buildModuleInstance } from '../helpers/module-fixtures';
import { E2E_NOTE_MEMBERS, seedNotes } from '../helpers/api';
import type { Note } from '@/types/notes';

/**
 * Drawing a note on the wall: the "Draw a note" button on a Notes card opens
 * a sheet with a page and pens. These drive the whole loop on a real display:
 * draw, say who drew it, see it land on the card and in the store, open it
 * large, Undo. The rules the hub holds a wall's token to are unit-tested
 * beside the routes (`api/notes/__tests__/route.test.ts`); the E2E hub runs
 * with no password, so here every caller is let in. These cards have writing
 * off, so the button only draws; `wall-note-write.spec.ts` has the keyboard
 * and the card that offers both.
 */

/** Every note on the board, read back through the route every surface reads. */
async function board(request: APIRequestContext): Promise<Note[]> {
  const res = await request.get('/api/notes?live=1');
  return ((await res.json()) as { notes: Note[] }).notes;
}

/** Draw one line across the page, through points given as shares of its width and height. */
async function drawLine(page: Page, canvas: Locator, points: Array<[number, number]>): Promise<void> {
  const box = (await canvas.boundingBox())!;
  const at = ([fx, fy]: [number, number]) => [box.x + box.width * fx, box.y + box.height * fy] as const;
  const [x0, y0] = at(points[0]);
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  for (const point of points.slice(1)) {
    const [x, y] = at(point);
    await page.mouse.move(x, y, { steps: 5 });
  }
  await page.mouse.up();
}

async function openSheet(page: Page, card: Locator): Promise<{ sheet: Locator; canvas: Locator; lines: Locator }> {
  await card.getByTestId('note-draw-door').click();
  const sheet = page.getByTestId('note-draw-sheet');
  await expect(sheet).toBeVisible();
  // The page ignores the tail of the tap that opened it; wait that out as a person's hand does.
  await page.waitForTimeout(450);
  return { sheet, canvas: sheet.getByTestId('note-draw-page'), lines: sheet.getByTestId('note-draw-canvas') };
}

test('draw a note, say who drew it, see it on the board, open it large, and Undo takes it off', async ({ page, request, sandboxDir }) => {
  seedNotes(sandboxDir);
  const notes = buildModuleInstance('notes', { view: 'board', wallDraw: true, wallWrite: false });
  const display = await renderOnDisplay(page, request, baseConfig({ screens: [makeScreen('s1', 'S1', [notes])] }));
  const card = display.module('notes');
  const before = (await board(request)).length;

  const { sheet, canvas, lines } = await openSheet(page, card);
  // An empty page has nothing to undo or send.
  await expect(sheet.getByTestId('note-draw-next')).toBeDisabled();
  await expect(sheet.getByTestId('note-draw-undo')).toBeDisabled();

  await drawLine(page, canvas, [[0.2, 0.8], [0.2, 0.4], [0.6, 0.4], [0.6, 0.8]]);
  await sheet.getByTestId('note-draw-ink-red').click();
  await sheet.getByTestId('note-draw-pen-1').click();
  await drawLine(page, canvas, [[0.15, 0.42], [0.4, 0.15], [0.65, 0.42]]);
  await drawLine(page, canvas, [[0.8, 0.2], [0.9, 0.3]]);
  await expect(lines).toHaveAttribute('data-lines', '3');

  // Undo takes back one line; Start over empties the page and Undo brings it back.
  await sheet.getByTestId('note-draw-undo').click();
  await expect(lines).toHaveAttribute('data-lines', '2');
  await sheet.getByTestId('note-draw-start-over').click();
  await expect(lines).toHaveAttribute('data-lines', '0');
  await sheet.getByTestId('note-draw-undo').click();
  await expect(lines).toHaveAttribute('data-lines', '2');

  await sheet.getByTestId('note-draw-next').click();
  // Nobody picked yet: nothing to send.
  await expect(sheet.getByTestId('note-draw-post')).toBeDisabled();
  await sheet.locator(`[data-testid="note-draw-face"][data-member="${E2E_NOTE_MEMBERS.sam.id}"]`).click();
  await sheet.getByTestId('note-draw-life-3d').click();
  await sheet.getByTestId('note-draw-post').click();

  await expect(page.getByTestId('note-draw-sheet')).toHaveCount(0);
  const notice = page.getByTestId('note-posted-notice');
  await expect(notice).toContainText(E2E_NOTE_MEMBERS.sam.name);

  // In the store: a drawing with no words, from Sam, for three days, the two lines in their pens.
  await expect.poll(async () => (await board(request)).length).toBe(before + 1);
  const drawn = (await board(request)).find((n) => n.drawing)!;
  expect(drawn).toMatchObject({ text: '', authorId: E2E_NOTE_MEMBERS.sam.id, life: '3d', pinned: false, important: false });
  expect(drawn.drawing!.lines.map((l) => [l.c, l.w])).toEqual([['ink', 0], ['red', 1]]);
  // A square's corners survive the tidy-up: the first line keeps its four points.
  expect(drawn.drawing!.lines[0].p.length / 2).toBe(4);

  // On the card, as a picture; a tap opens it large.
  const picture = card.getByTestId('notes-drawing');
  await expect(picture).toBeVisible();
  await expect(picture.getByTestId('note-drawing-art').locator('path')).toHaveCount(2);
  await picture.click();
  const large = page.getByTestId('note-drawing-overlay');
  await expect(large).toContainText(E2E_NOTE_MEMBERS.sam.name);
  await expect(large.getByTestId('note-drawing-art').locator('path')).toHaveCount(2);
  await page.getByTestId('note-drawing-overlay-close').click();
  await expect(large).toHaveCount(0);

  // Undo, while it is offered, takes the note off the board for good.
  await page.getByTestId('note-posted-undo').click();
  await expect(notice).toHaveCount(0);
  await expect.poll(async () => (await board(request)).some((n) => n.drawing)).toBe(false);
  await expect(card.getByTestId('notes-drawing')).toHaveCount(0);
});

test('Close with lines on the page asks first; an empty page just closes', async ({ page, request, sandboxDir }) => {
  seedNotes(sandboxDir);
  const notes = buildModuleInstance('notes', { view: 'sticky', wallDraw: true, wallWrite: false });
  const display = await renderOnDisplay(page, request, baseConfig({ screens: [makeScreen('s1', 'S1', [notes])] }));
  const card = display.module('notes');

  const first = await openSheet(page, card);
  await first.sheet.getByTestId('note-draw-close').click();
  await expect(page.getByTestId('note-draw-sheet')).toHaveCount(0);
  // A tap that closes a sheet makes the wall deaf to that spot for a moment
  // (`sheet-tap-guard.ts`), and the next Close sits on the same spot. A
  // person takes longer than that to open the sheet again and draw.
  await page.waitForTimeout(1600);

  const { sheet, canvas, lines } = await openSheet(page, card);
  await drawLine(page, canvas, [[0.3, 0.3], [0.7, 0.7]]);
  await sheet.getByTestId('note-draw-close').click();
  await expect(sheet.getByTestId('note-draw-ask')).toBeVisible();
  await sheet.getByTestId('note-draw-keep').click();
  await expect(lines).toHaveAttribute('data-lines', '1');
  await sheet.getByTestId('note-draw-close').click();
  await sheet.getByTestId('note-draw-throw').click();
  await expect(page.getByTestId('note-draw-sheet')).toHaveCount(0);
  // Thrown away, so the button starts a new drawing rather than offering the old one.
  await expect(card.getByTestId('note-draw-door')).toHaveText('Draw a note');
  expect((await board(request)).some((n) => n.drawing)).toBe(false);
});

test('a hub that does not answer keeps the drawing in the sheet, and the same button tries again', async ({ page, request, sandboxDir }) => {
  seedNotes(sandboxDir);
  const notes = buildModuleInstance('notes', { view: 'whiteboard', wallDraw: true, wallWrite: false });
  const display = await renderOnDisplay(page, request, baseConfig({ screens: [makeScreen('s1', 'S1', [notes])] }));
  const { sheet, canvas } = await openSheet(page, display.module('notes'));
  await drawLine(page, canvas, [[0.3, 0.3], [0.7, 0.7]]);
  await sheet.getByTestId('note-draw-next').click();
  await sheet.locator('[data-testid="note-draw-face"][data-member=""]').click();

  await page.route('**/api/notes', (route) => (route.request().method() === 'POST' ? route.abort() : route.fallback()));
  await sheet.getByTestId('note-draw-post').click();
  await expect(sheet.getByTestId('note-draw-problem')).toBeVisible();
  await expect(sheet.getByTestId('note-draw-post')).toHaveText('Try again');
  expect((await board(request)).some((n) => n.drawing)).toBe(false);

  await page.unroute('**/api/notes');
  await sheet.getByTestId('note-draw-post').click();
  await expect(page.getByTestId('note-draw-sheet')).toHaveCount(0);
  // Posted as nobody: the note carries no author.
  await expect.poll(async () => (await board(request)).find((n) => n.drawing)?.authorId ?? null).toBeNull();
  await expect.poll(async () => (await board(request)).some((n) => n.drawing)).toBe(true);
});

test('two at the wall: a colour tapped while another finger is still drawing takes, and Next cannot be double-tapped into posting', async ({ page, request, sandboxDir }) => {
  seedNotes(sandboxDir);
  const notes = buildModuleInstance('notes', { view: 'board', wallDraw: true, wallWrite: false });
  const display = await renderOnDisplay(page, request, baseConfig({ screens: [makeScreen('s1', 'S1', [notes])] }));
  const { sheet, canvas, lines } = await openSheet(page, display.module('notes'));

  // Real touches: a browser makes no click for a tap while another finger is down.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', points: Array<{ x: number; y: number; id: number }>) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  const box = (await canvas.boundingBox())!;
  const red = (await sheet.getByTestId('note-draw-ink-red').boundingBox())!;
  const drawing = { x: box.x + box.width * 0.3, y: box.y + box.height * 0.5, id: 1 };
  const tapping = { x: red.x + red.width / 2, y: red.y + red.height / 2, id: 2 };

  await touch('touchStart', [drawing]);
  await touch('touchMove', [{ ...drawing, x: drawing.x + 60 }]);
  // The other child taps red while the first finger is still on the page.
  await touch('touchStart', [{ ...drawing, x: drawing.x + 60 }, tapping]);
  // The protocol lifts every finger together. No click comes out of this
  // (two fingers were down), so only the button's own tap can take it.
  await touch('touchEnd', []);
  await expect(sheet.getByTestId('note-draw-ink-red')).toHaveAttribute('aria-pressed', 'true');
  await expect(lines).toHaveAttribute('data-lines', '1');

  // A fast double tap on Next: the second tap lands where "Put it on the
  // board" now sits. Somebody was picked on an earlier visit to this step,
  // so only the pause after the step changed keeps it from posting.
  await sheet.getByTestId('note-draw-next').click();
  await sheet.locator('[data-testid="note-draw-face"][data-member=""]').click();
  await sheet.getByTestId('note-draw-back').click();
  const next = (await sheet.getByTestId('note-draw-next').boundingBox())!;
  const spot = { x: next.x + next.width / 2, y: next.y + next.height / 2, id: 3 };
  await expect(sheet.getByTestId('note-draw-next')).toBeEnabled();
  await touch('touchStart', [spot]);
  await touch('touchEnd', []);
  await page.waitForTimeout(110);
  await touch('touchStart', [spot]);
  await touch('touchEnd', []);
  await expect(sheet.getByTestId('note-draw-post')).toBeVisible();
  await page.waitForTimeout(600);
  await expect(page.getByTestId('note-draw-sheet')).toBeVisible();
  expect((await board(request)).some((n) => n.drawing)).toBe(false);

  // "Throw it away" by touch closes the sheet when the finger lifts. The
  // browser's click for that same tap must not reach the wall underneath,
  // where the card's own button would open the sheet again.
  await page.evaluate(() => {
    const seen = window as unknown as { passedThrough: number };
    seen.passedThrough = 0;
    document.addEventListener('click', (e) => {
      if (!(e.target as Element).closest('[data-testid="note-draw-sheet"]')) seen.passedThrough += 1;
    });
  });
  const tapOn = async (target: Locator) => {
    await expect(target).toBeEnabled();
    const b = (await target.boundingBox())!;
    await touch('touchStart', [{ x: b.x + b.width / 2, y: b.y + b.height / 2, id: 4 }]);
    await touch('touchEnd', []);
  };
  await tapOn(sheet.getByTestId('note-draw-back'));
  await tapOn(sheet.getByTestId('note-draw-close'));
  await tapOn(sheet.getByTestId('note-draw-throw'));
  await expect(page.getByTestId('note-draw-sheet')).toHaveCount(0);
  await page.waitForTimeout(500);
  await expect(page.getByTestId('note-draw-sheet')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { passedThrough: number }).passedThrough)).toBe(0);
});

test('no button with drawing and writing off, or in a view with no room for one', async ({ page, request, sandboxDir }) => {
  seedNotes(sandboxDir);
  const off = buildModuleInstance('notes', { view: 'board', wallDraw: false, wallWrite: false });
  const ticker = { ...buildModuleInstance('notes', { view: 'ticker', wallDraw: true, wallWrite: false }), id: 'notes-ticker', position: { x: 40, y: 700 } };
  const display = await renderOnDisplay(page, request, baseConfig({ screens: [makeScreen('s1', 'S1', [off, ticker])] }));
  await expect(display.module('notes').first()).toBeVisible();
  await expect(page.getByTestId('note-draw-door')).toHaveCount(0);
});
