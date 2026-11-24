import { describe, expect, it } from 'vitest';
import { NOTES_DRAW_VIEWS, notesCardDoor, notesCardDraws, notesCardWrites, wallMayDraw, wallMayWrite } from '../notes-wall';
import type { ScreenConfiguration } from '@/types/config';

function configWith(...modules: Array<{ type: string; config: Record<string, unknown>; enabled?: boolean }>): ScreenConfiguration {
  return {
    version: 21,
    settings: {},
    screens: [{ id: 's', name: 'S', modules: modules.map((m, i) => ({ id: `m${i}`, position: { x: 0, y: 0 }, size: { w: 1, h: 1 }, style: {}, ...m })) }],
  } as unknown as ScreenConfiguration;
}

describe('notesCardDraws', () => {
  it('needs drawing on and a view with room for the button', () => {
    expect(notesCardDraws({ view: 'board', wallDraw: true })).toBe(true);
    expect(notesCardDraws({ wallDraw: true })).toBe(true);
    expect(notesCardDraws({ view: 'whiteboard', wallDraw: true })).toBe(true);
    expect(notesCardDraws({ view: 'board' })).toBe(false);
    expect(notesCardDraws({ view: 'board', wallDraw: false })).toBe(false);
    for (const view of ['strip', 'ticker', 'compact', 'count', 'spotlight', 'latest', 'neon', 'letterboard'] as const) {
      expect(NOTES_DRAW_VIEWS.has(view)).toBe(false);
      expect(notesCardDraws({ view, wallDraw: true })).toBe(false);
    }
  });
});

describe('a card that shows only some notes', () => {
  it('has no button, because a drawing made there would never show on it', () => {
    expect(notesCardDraws({ view: 'board', wallDraw: true, filter: 'pinned' })).toBe(false);
    expect(notesCardDraws({ view: 'sticky', wallDraw: true, filter: 'important' })).toBe(false);
    expect(notesCardDraws({ view: 'board', wallDraw: true, filter: 'all' })).toBe(true);
    // Timeline and By person show every note whatever the setting says.
    expect(notesCardDraws({ view: 'timeline', wallDraw: true, filter: 'pinned' })).toBe(true);
    expect(notesCardDraws({ view: 'by-person', wallDraw: true, filter: 'important' })).toBe(true);
    expect(wallMayDraw(configWith({ type: 'notes', config: { view: 'board', wallDraw: true, filter: 'pinned' } }))).toBe(false);
  });
});

describe('wallMayDraw', () => {
  it('is true only while a Notes card some wall draws offers the button', () => {
    expect(wallMayDraw(configWith({ type: 'notes', config: { view: 'sticky', wallDraw: true } }))).toBe(true);
    expect(wallMayDraw(configWith())).toBe(false);
    expect(wallMayDraw(configWith({ type: 'notes', config: { view: 'sticky' } }))).toBe(false);
    expect(wallMayDraw(configWith({ type: 'notes', config: { view: 'count', wallDraw: true } }))).toBe(false);
    expect(wallMayDraw(configWith({ type: 'notes', config: { view: 'sticky', wallDraw: true }, enabled: false }))).toBe(false);
    // Another card's setting of the same name counts for nothing.
    expect(wallMayDraw(configWith({ type: 'todo', config: { wallDraw: true } }))).toBe(false);
  });
});

describe('writing on the wall', () => {
  it('has its own switch, with the room and the reach a drawing needs', () => {
    expect(notesCardWrites({ view: 'board', wallWrite: true })).toBe(true);
    expect(notesCardWrites({ wallWrite: true })).toBe(true);
    expect(notesCardWrites({ view: 'board', wallDraw: true })).toBe(false);
    expect(notesCardWrites({ view: 'ticker', wallWrite: true })).toBe(false);
    expect(notesCardWrites({ view: 'board', wallWrite: true, filter: 'pinned' })).toBe(false);
    expect(notesCardWrites({ view: 'timeline', wallWrite: true, filter: 'pinned' })).toBe(true);
  });

  it('gives the card one button: for drawing, for writing, or for both', () => {
    expect(notesCardDoor({ view: 'board' })).toBeNull();
    expect(notesCardDoor({ view: 'board', wallDraw: true })).toBe('draw');
    expect(notesCardDoor({ view: 'board', wallWrite: true })).toBe('write');
    expect(notesCardDoor({ view: 'board', wallDraw: true, wallWrite: true })).toBe('both');
    expect(notesCardDoor({ view: 'count', wallDraw: true, wallWrite: true })).toBeNull();
  });

  it('is allowed only while a Notes card some wall draws offers it, whatever drawing says', () => {
    expect(wallMayWrite(configWith({ type: 'notes', config: { view: 'sticky', wallWrite: true } }))).toBe(true);
    expect(wallMayWrite(configWith({ type: 'notes', config: { view: 'sticky', wallDraw: true } }))).toBe(false);
    expect(wallMayDraw(configWith({ type: 'notes', config: { view: 'sticky', wallWrite: true } }))).toBe(false);
    expect(wallMayWrite(configWith({ type: 'notes', config: { view: 'sticky', wallWrite: true }, enabled: false }))).toBe(false);
    expect(wallMayWrite(configWith({ type: 'todo', config: { wallWrite: true } }))).toBe(false);
  });
});
