
import type { FamilyMember } from '@/types/family';
// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, waitFor, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { DEFAULT_MODULE_STYLE, type TodoConfig, type ModuleStyle} from '@/types/config';
import type { TodoList, TodoListItem } from '@/types/todos';
import { I18nProvider } from '@/i18n/provider';
import enUSModules from '@/translations/en-US/modules.json';

// jsdom doesn't ship ResizeObserver; useScaledFontSize needs it.
class ResizeObserverStub {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
(globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver = ResizeObserverStub;

// Drive the lists poll deterministically: a test sets `mockLists` (null =
// first fetch still in flight) and rerenders to deliver a "poll result".
// The family URL answers from `mockMembers`; the empty url contract returns
// null. `requestedUrls` records what the module asked for, so a test can
// prove the roster is not fetched until an item names someone.
let mockLists: { lists: TodoList[] } | null = null;
let mockMembers: { members: FamilyMember[] } | null = null;
const requestedUrls = new Set<string>();
vi.mock('@/hooks/useFetchData', () => ({
  useFetchData: (url: string) => {
    if (url) requestedUrls.add(url);
    if (url === '/api/todo/lists') return [mockLists, null, null];
    if (url === '/api/family') return [mockMembers, null, null];
    return [null, null, null];
  },
}));

const displayFetch = vi.fn();
vi.mock('@/lib/display-fetch', () => ({
  displayFetch: (...args: unknown[]) => displayFetch(...args),
}));

// The wall writes through `todo-client`, which hands the response straight to
// every subscriber via `displayCache.replace` rather than seeding and waiting.
const cacheReplace = vi.fn();
vi.mock('@/lib/display-cache', () => ({
  displayCache: { replace: (...args: unknown[]) => cacheReplace(...args) },
}));

import TodoModule, { arrangeItems, describeDue } from '../TodoModule';
import { toTZWallTime } from '@/lib/timezone';

const style: ModuleStyle = { ...DEFAULT_MODULE_STYLE };

function Wrapper({ children }: { children: ReactNode }) {
  return <I18nProvider locale="en-US" blob={{ modules: enUSModules }}>{children}</I18nProvider>;
}

function item(id: string, text: string, completed = false, extra: Partial<TodoListItem> = {}): TodoListItem {
  return { id, text, completed, createdAt: '2026-09-01T00:00:00.000Z', ...extra };
}

function member(id: string, name: string, color: string): FamilyMember {
  return { id, name, color, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' };
}

function list(id: string, name: string, items: TodoListItem[], extra: Partial<TodoList> = {}): TodoList {
  return {
    id,
    name,
    slug: id,
    items,
    repeat: 'never',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...extra,
  };
}

const groceries = () => list('groceries', 'Groceries', [
  item('i1', 'Take out trash'),
  item('i2', 'Feed the cat', true),
  item('i3', 'Buy oat milk'),
]);

function makeConfig(overrides: Partial<TodoConfig> = {}): TodoConfig {
  return { listId: 'groceries', view: 'list', accentColor: '#3b82f6', ...overrides };
}

function renderStatic(config: Partial<TodoConfig> = {}) {
  return render(<TodoModule config={makeConfig(config)} style={style} />, { wrapper: Wrapper });
}

/** Render an interactive, fully-addressed todo module (as the display does). */
function renderInteractive(extra: Partial<TodoConfig> = {}) {
  const config = makeConfig({ interactive: true, ...extra });
  const el = (c: TodoConfig) => (
    <TodoModule config={c} style={style} displayId="kitchen" screenId="s1" moduleId="m1" />
  );
  const utils = render(el(config), { wrapper: Wrapper });
  return { ...utils, rerenderSame: () => utils.rerender(el(config)) };
}

const itemTexts = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('[data-testid="todo-item"]')).map((el) => el.textContent?.trim());

beforeEach(() => {
  displayFetch.mockReset();
  cacheReplace.mockReset();
  mockLists = { lists: [groceries()] };
  mockMembers = null;
  requestedUrls.clear();
});
afterEach(() => cleanup());

describe('arrangeItems', () => {
  const items = [item('a', 'A', true), item('b', 'B'), item('c', 'C', true), item('d', 'D')];
  it('sinks done items below open ones, keeping relative order', () => {
    expect(arrangeItems(items, 'bottom').map((i) => i.id)).toEqual(['b', 'd', 'a', 'c']);
    expect(arrangeItems(items, undefined).map((i) => i.id)).toEqual(['b', 'd', 'a', 'c']);
  });
  it('keeps store order inline', () => {
    expect(arrangeItems(items, 'inline').map((i) => i.id)).toEqual(['a', 'b', 'c', 'd']);
  });
  it('drops done items when hidden', () => {
    expect(arrangeItems(items, 'hidden').map((i) => i.id)).toEqual(['b', 'd']);
  });
});

describe('describeDue', () => {
  const t = (key: string) => key;
  const now = new Date(2026, 8, 9, 14, 30); // Wed 9 Sep 2026, local
  it('names overdue, today and tomorrow', () => {
    expect(describeDue('2026-09-08', now, t, 'en-US')).toEqual({ label: 'todo.due.overdue', tone: 'overdue' });
    expect(describeDue('2026-09-09', now, t, 'en-US')).toEqual({ label: 'todo.due.today', tone: 'today' });
    expect(describeDue('2026-09-10', now, t, 'en-US')).toEqual({ label: 'todo.due.tomorrow', tone: 'neutral' });
  });
  it('uses the weekday inside the coming week and a short date past it', () => {
    expect(describeDue('2026-09-12', now, t, 'en-US')).toEqual({ label: 'Sat', tone: 'neutral' });
    expect(describeDue('2026-09-15', now, t, 'en-US')).toEqual({ label: 'Tue', tone: 'neutral' });
    expect(describeDue('2026-09-16', now, t, 'en-US')).toEqual({ label: 'Sep 16', tone: 'neutral' });
  });
  it('ignores a malformed date', () => {
    expect(describeDue('soon', now, t, 'en-US')).toBeNull();
  });
  it('reckons today in the display timezone, not the machine clock', () => {
    // 01:00 UTC on the 10th is 20:00 on the 9th in Chicago: an item due the
    // 9th is still Today there, and Overdue only by the UTC clock.
    const instant = new Date('2026-09-10T01:00:00.000Z');
    const chicago = toTZWallTime(instant, 'America/Chicago');
    expect(describeDue('2026-09-09', chicago, t, 'en-US')?.tone).toBe('today');
    const utc = toTZWallTime(instant, 'UTC');
    expect(describeDue('2026-09-09', utc, t, 'en-US')?.tone).toBe('overdue');
  });
  it('never calls a done item overdue', () => {
    expect(describeDue('2026-09-08', now, t, 'en-US', true)).toEqual({ label: 'Sep 8', tone: 'neutral' });
  });
});

describe('TodoModule all-done state', () => {
  it('replaces the count with the green check and All done, keeps items struck through', () => {
    mockLists = { lists: [list('groceries', 'Before school', [item('a', 'Brush teeth', true), item('b', 'Pack lunch', true)], { repeat: 'daily' })] };
    const { getByTestId, container, queryByTestId } = renderStatic();
    expect(getByTestId('todo-all-done').textContent).toBe('All done');
    expect(container.textContent).not.toContain('2/2');
    expect(itemTexts(container)).toEqual(['Brush teeth', 'Pack lunch']);
    expect(getByTestId('todo-repeat').textContent).toBe('Starts fresh every day');
    cleanup();
    mockLists = { lists: [list('groceries', 'Weekly', [item('a', 'Vacuum', true)], { repeat: 'weekly' })] };
    expect(renderStatic().getByTestId('todo-repeat').textContent).toBe('Starts fresh every week');
    cleanup();
    mockLists = { lists: [list('groceries', 'Once', [item('a', 'Vacuum', true)])] };
    renderStatic();
    expect(queryByTestId('todo-repeat')).toBeNull();
  });

  it('is not shown while anything is open, and the repeat line stays hidden until then', () => {
    mockLists = { lists: [list('groceries', 'Before school', [item('a', 'Brush teeth', true), item('b', 'Pack lunch')], { repeat: 'daily' })] };
    const { queryByTestId } = renderStatic();
    expect(queryByTestId('todo-all-done')).toBeNull();
    expect(queryByTestId('todo-repeat')).toBeNull();
  });

  it('shows in the focus, progress, compact and board views too', () => {
    mockLists = { lists: [list('groceries', 'Groceries', [item('a', 'Eggs', true)])] };
    for (const view of ['focus', 'progress', 'compact', 'board'] as const) {
      const { getByTestId } = renderStatic({ view });
      expect(getByTestId('todo-all-done').textContent).toBe('All done');
      cleanup();
    }
  });
});

describe('TodoModule empty states', () => {
  it('asks for a list when none is picked or the picked one is gone', () => {
    const none = renderStatic({ listId: undefined });
    expect(none.container.textContent).toContain('Pick a list in the editor');
    none.unmount();
    const gone = renderStatic({ listId: 'deleted' });
    expect(gone.container.textContent).toContain('Pick a list in the editor');
  });

  it('says the list is empty when it has no items', () => {
    mockLists = { lists: [list('groceries', 'Groceries', [])] };
    const { container } = renderStatic();
    expect(container.textContent).toContain('Add things on your phone and they show up here');
  });

  it('board with no lists at all points at the phone', () => {
    mockLists = { lists: [] };
    const { container } = renderStatic({ view: 'board' });
    expect(container.textContent).toContain('No lists yet. Make one on your phone.');
  });
});

describe('TodoModule other views', () => {
  it('focus: Up next, the first three open items in descending size, and N more, N left', () => {
    mockLists = { lists: [list('groceries', 'Groceries', [
      item('a', 'Oat milk'), item('b', 'Bananas'), item('c', 'Candles'), item('d', 'Dog food'), item('e', 'Sunscreen'), item('f', 'Eggs', true),
    ])] };
    const { container, getByText } = renderStatic({ view: 'focus' });
    getByText('Up next');
    expect(itemTexts(container)).toEqual(['Oat milk', 'Bananas', 'Candles']);
    const rows = container.querySelectorAll<HTMLElement>('[data-testid="todo-item"]');
    expect(rows[0].style.fontSize).toBe('1.55em');
    expect(rows[1].style.fontSize).toBe('1.15em');
    getByText('and 2 more');
    getByText('5 left');
  });

  it('progress: done of total in the ring, the name and the open items', () => {
    const { container, getByText } = renderStatic({ view: 'progress' });
    expect(container.querySelectorAll('circle')).toHaveLength(2);
    expect(container.textContent).toContain('1of3');
    getByText('done');
    getByText('Groceries');
    expect(itemTexts(container)).toEqual(['Take out trash,', 'Buy oat milk']);
  });

  it('compact: dense rows with no checkboxes or tap targets even when interactive', () => {
    const { container } = renderInteractive({ view: 'compact' });
    expect(container.querySelectorAll('button')).toHaveLength(0);
    expect(container.querySelectorAll('svg')).toHaveLength(0);
    expect(itemTexts(container)).toEqual(['Take out trash', 'Buy oat milk', 'Feed the cat']);
  });

  it('board: every list as a column with its count and first five items, ignoring listId', () => {
    mockLists = { lists: [
      groceries(),
      list('cabin', 'Cabin trip', ['Sleeping bags', 'Headlamps', 'Marshmallows', 'Board games', 'Bug spray', 'Cooler', 'Swimsuits'].map((t, i) => item(`c${i}`, t)), { color: '#a78bfa' }),
    ] };
    const { getAllByTestId, getByText } = renderStatic({ view: 'board', listId: 'nope' });
    const cols = getAllByTestId('todo-board-column');
    expect(cols).toHaveLength(2);
    expect(cols[0].textContent).toContain('Groceries');
    expect(cols[0].textContent).toContain('2 left');
    expect(cols[1].querySelectorAll('[data-testid="todo-item"]')).toHaveLength(5);
    getByText('and 2 more');
    expect((cols[1].querySelector('span') as HTMLElement).style.backgroundColor).toBe('rgb(167, 139, 250)');
  });
});

describe('TodoModule tap to check off', () => {
  const itemUrl = '/api/todo/lists/groceries/items/i1';
  const okResponse = (completed: boolean) => ({
    ok: true,
    json: async () => ({ lists: [list('groceries', 'Groceries', [item('i1', 'Take out trash', completed), item('i2', 'Feed the cat', true), item('i3', 'Buy oat milk')])] }),
  });
  /** A checked row sinks below the open ones, so rows are found by name, never by index. */
  const row = (container: HTMLElement, text: string) =>
    Array.from(container.querySelectorAll<HTMLButtonElement>('button[data-testid="todo-item"]')).find((b) => b.textContent?.includes(text)) as HTMLButtonElement;
  const pressed = (container: HTMLElement, text: string) => row(container, text).getAttribute('aria-pressed');

  it('stays static when interactive is set but the instance address is missing', () => {
    // The editor preview passes config.interactive but no screenId/moduleId.
    const { container } = renderStatic({ interactive: true });
    expect(container.querySelectorAll('button')).toHaveLength(0);
  });

  it('renders a button per row reflecting completion', () => {
    const { container } = renderInteractive();
    expect(container.querySelectorAll('button[data-testid="todo-item"]')).toHaveLength(3);
    expect(pressed(container, 'Take out trash')).toBe('false');
    expect(pressed(container, 'Feed the cat')).toBe('true');
  });

  it('optimistically flips on tap, PATCHes the item, and sinks the row', () => {
    displayFetch.mockReturnValue(new Promise(() => {})); // never resolves
    const { container } = renderInteractive();
    fireEvent.click(row(container, 'Take out trash'));
    expect(pressed(container, 'Take out trash')).toBe('true');
    // Done items keep store order below the open ones.
    expect(itemTexts(container)).toEqual(['Buy oat milk', 'Take out trash', 'Feed the cat']);
    expect(displayFetch).toHaveBeenCalledWith(itemUrl, expect.objectContaining({ method: 'PATCH' }));
    expect(JSON.parse(displayFetch.mock.calls[0][1].body)).toEqual({ completed: true });
  });

  it('unchecks a done item with completed: false', () => {
    displayFetch.mockReturnValue(new Promise(() => {}));
    const { container } = renderInteractive();
    fireEvent.click(row(container, 'Feed the cat'));
    expect(pressed(container, 'Feed the cat')).toBe('false');
    expect(JSON.parse(displayFetch.mock.calls[0][1].body)).toEqual({ completed: false });
  });

  it('reconciles to the server value and hands the lists to every other card', async () => {
    displayFetch.mockResolvedValue(okResponse(true));
    const { container } = renderInteractive();
    await act(async () => { fireEvent.click(row(container, 'Take out trash')); });
    await waitFor(() => expect(pressed(container, 'Take out trash')).toBe('true'));
    expect(cacheReplace).toHaveBeenCalledWith('/api/todo/lists', expect.objectContaining({ lists: expect.any(Array) }), 5_000);
  });

  it('reverts only the tapped item when the request fails', async () => {
    displayFetch.mockResolvedValue({ ok: false });
    const { container } = renderInteractive();
    await act(async () => { fireEvent.click(row(container, 'Take out trash')); });
    await waitFor(() => expect(pressed(container, 'Take out trash')).toBe('false'));
    expect(pressed(container, 'Feed the cat')).toBe('true');
    expect(pressed(container, 'Buy oat milk')).toBe('false');
  });

  it('does not let a stale poll clobber an in-flight flip', async () => {
    displayFetch.mockReturnValue(new Promise(() => {}));
    const { container, rerenderSame } = renderInteractive();
    fireEvent.click(row(container, 'Take out trash'));
    expect(pressed(container, 'Take out trash')).toBe('true');
    // A poll that predates the tap lands while the request is in flight.
    mockLists = { lists: [groceries()] };
    await act(async () => { rerenderSame(); });
    expect(pressed(container, 'Take out trash')).toBe('true');
  });

  it('holds a confirmed flip through a stale poll inside the override window', async () => {
    displayFetch.mockResolvedValue(okResponse(true));
    const { container, rerenderSame } = renderInteractive();
    await act(async () => { fireEvent.click(row(container, 'Take out trash')); });
    await waitFor(() => expect(pressed(container, 'Take out trash')).toBe('true'));
    mockLists = { lists: [groceries()] }; // read before our write landed
    await act(async () => { rerenderSame(); });
    expect(pressed(container, 'Take out trash')).toBe('true');
  });

  it('reflects a check-off arriving from another surface via a later poll', async () => {
    const { container, rerenderSame } = renderInteractive();
    expect(pressed(container, 'Take out trash')).toBe('false');
    mockLists = { lists: [list('groceries', 'Groceries', [item('i1', 'Take out trash', true), item('i2', 'Feed the cat', true), item('i3', 'Buy oat milk')])] };
    await act(async () => { rerenderSame(); });
    expect(pressed(container, 'Take out trash')).toBe('true');
    expect(itemTexts(container)).toEqual(['Buy oat milk', 'Take out trash', 'Feed the cat']);
  });

  it('ignores a double tap while a request is in flight', () => {
    displayFetch.mockReturnValue(new Promise(() => {}));
    const { container } = renderInteractive();
    fireEvent.click(row(container, 'Take out trash'));
    fireEvent.click(row(container, 'Take out trash'));
    expect(displayFetch).toHaveBeenCalledTimes(1);
    expect(pressed(container, 'Take out trash')).toBe('true');
  });

  it("checks off in the board view against the item's own list", () => {
    displayFetch.mockReturnValue(new Promise(() => {}));
    mockLists = { lists: [groceries(), list('cabin', 'Cabin trip', [item('c1', 'Cooler')])] };
    const { getAllByTestId } = renderInteractive({ view: 'board' });
    const cols = getAllByTestId('todo-board-column');
    const cooler = cols[1].querySelector('button') as HTMLButtonElement;
    fireEvent.click(cooler);
    expect(cooler.getAttribute('aria-pressed')).toBe('true');
    expect(displayFetch).toHaveBeenCalledWith('/api/todo/lists/cabin/items/c1', expect.objectContaining({ method: 'PATCH' }));
  });
});

// ─── Touch treatment: 38px tap checkbox, pressed state, one-time hint ───

/** jsdom's localStorage is non-functional under this setup; stub an in-memory one. */
function makeLocalStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  } as Storage;
}

describe('TodoModule assignees', () => {
  const roster = () => ({ members: [member('m1', 'ava', '#f472b6'), member('m2', 'Ben', '#60a5fa'), member('m3', 'Cy', '#4ade80')] });
  const bubbles = (container: HTMLElement) =>
    Array.from(container.querySelectorAll('[data-testid="todo-assignees"] span')) as HTMLElement[];

  it('renders an initial per person in their colour, capped at two with +N', () => {
    mockMembers = roster();
    mockLists = { lists: [list('groceries', 'Groceries', [item('i1', 'Walk the dog', false, { assigneeIds: ['m1', 'm2', 'm3'] })])] };
    const { container } = renderStatic();
    const b = bubbles(container);
    expect(b.map((el) => el.textContent)).toEqual(['A', 'B', '+1']);
    expect(b[0].style.backgroundColor).toBe('rgb(244, 114, 182)');
    expect(b[0].title).toBe('ava');
    expect(requestedUrls.has('/api/family')).toBe(true);
  });

  it('skips ids that are no longer on the roster, and draws nothing when none are', () => {
    mockMembers = roster();
    mockLists = { lists: [list('groceries', 'Groceries', [
      item('i1', 'Walk the dog', false, { assigneeIds: ['gone', 'm2'] }),
      item('i2', 'Feed the cat', false, { assigneeIds: ['gone'] }),
    ])] };
    const { container } = renderStatic();
    expect(container.querySelectorAll('[data-testid="todo-assignees"]')).toHaveLength(1);
    expect(bubbles(container).map((el) => el.textContent)).toEqual(['B']);
  });

  it('shows none when the toggle is off, and never asks for the roster', () => {
    mockMembers = roster();
    mockLists = { lists: [list('groceries', 'Groceries', [item('i1', 'Walk the dog', false, { assigneeIds: ['m1'] })])] };
    const { container } = renderStatic({ showAssignees: false });
    expect(container.querySelectorAll('[data-testid="todo-assignees"]')).toHaveLength(0);
    expect(requestedUrls.has('/api/family')).toBe(false);
  });

  it('does not fetch the roster while no visible item names anyone', () => {
    mockMembers = roster();
    renderStatic();
    expect(requestedUrls.has('/api/family')).toBe(false);
  });

  it('shows initials in the board view against every list', () => {
    mockMembers = roster();
    mockLists = { lists: [
      list('groceries', 'Groceries', [item('i1', 'Milk')]),
      list('chores', 'Chores', [item('c1', 'Bins', false, { assigneeIds: ['m3'] })]),
    ] };
    const { container } = renderStatic({ view: 'board' });
    expect(bubbles(container).map((el) => el.textContent)).toEqual(['C']);
  });
});

describe('TodoModule touch treatment', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeLocalStorage());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('static lists keep the small check glyph; interactive lists get the tap checkbox', () => {
    const plain = renderStatic();
    expect(plain.queryAllByTestId('tap-checkbox')).toHaveLength(0);
    expect(plain.queryByTestId('todo-tap-hint')).toBeNull();
    plain.unmount();

    const { getAllByTestId } = renderInteractive();
    const boxes = getAllByTestId('tap-checkbox');
    expect(boxes).toHaveLength(3);
    expect(boxes[0].style.width).toBe('38px');
    expect(boxes[0].hasAttribute('data-checked')).toBe(false);
    expect(boxes[2].hasAttribute('data-checked')).toBe(true);
    expect(boxes[2].style.backgroundColor).toBe('rgb(59, 130, 246)');
  });

  it('swaps the pre-v2 black accent for a visible fill', () => {
    const { getAllByTestId } = renderInteractive({ accentColor: '#000000' });
    expect(getAllByTestId('tap-checkbox')[2].style.backgroundColor).toBe('rgb(59, 130, 246)');
  });

  it('marks the row and box pressed while the request is in flight', async () => {
    let settle: (value: Response) => void = () => {};
    displayFetch.mockReturnValue(new Promise<Response>((resolve) => { settle = resolve; }));
    const { getByRole } = renderInteractive();
    const row = getByRole('button', { name: /Take out trash/ });
    fireEvent.click(row);
    expect(row.hasAttribute('data-pressed')).toBe(true);
    expect(row.querySelector('[data-testid="tap-checkbox"]')?.hasAttribute('data-pressed')).toBe(true);

    await act(async () => {
      settle({
        ok: true,
        json: async () => ({ lists: [list('groceries', 'Groceries', [item('i1', 'Take out trash', true), item('i2', 'Feed the cat', true), item('i3', 'Buy oat milk')])] }),
      } as unknown as Response);
    });
    await waitFor(() => expect(row.hasAttribute('data-pressed')).toBe(false));
    expect(getByRole('button', { name: /Take out trash/ }).getAttribute('aria-pressed')).toBe('true');
  });

  it('shows the tap hint once per display and never again', () => {
    const first = renderInteractive();
    expect(first.getByTestId('todo-tap-hint').textContent).toBe('Tap a box to check it off');
    expect(localStorage.getItem('hs:todo-tap-hint-seen')).toBe('1');
    first.unmount();

    const second = renderInteractive();
    expect(second.queryByTestId('todo-tap-hint')).toBeNull();
  });

  it('dismisses the hint on the first tap', () => {
    displayFetch.mockReturnValue(new Promise(() => {}));
    const { getByRole, queryByTestId } = renderInteractive();
    expect(queryByTestId('todo-tap-hint')).not.toBeNull();
    fireEvent.click(getByRole('button', { name: /Take out trash/ }));
    expect(queryByTestId('todo-tap-hint')).toBeNull();
  });
});
