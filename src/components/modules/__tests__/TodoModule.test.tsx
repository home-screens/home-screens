// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, waitFor, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { DEFAULT_MODULE_STYLE, type TodoConfig, type ModuleStyle } from '@/types/config';
import type { TodoState } from '@/lib/todo-data';
import { I18nProvider } from '@/i18n/provider';
import enUSModules from '@/translations/en-US/modules.json';

// jsdom doesn't ship ResizeObserver; useScaledFontSize needs it.
class ResizeObserverStub {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
(globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver = ResizeObserverStub;

// Drive the runtime-state poll deterministically. `useFetchData` is mocked so a
// test can push a "poll result" via `mockTodoState` + a rerender, and the empty
// url contract (non-interactive modules) returns null so they never merge.
let mockTodoState: TodoState | null = null;
vi.mock('@/hooks/useFetchData', () => ({
  useFetchData: (url: string) => [url ? mockTodoState : null, null],
}));

const displayFetch = vi.fn();
vi.mock('@/lib/display-fetch', () => ({
  displayFetch: (...args: unknown[]) => displayFetch(...args),
}));

import TodoModule from '../TodoModule';

const style: ModuleStyle = { ...DEFAULT_MODULE_STYLE };

function Wrapper({ children }: { children: ReactNode }) {
  return <I18nProvider locale="en-US" blob={{ modules: enUSModules }}>{children}</I18nProvider>;
}

function makeConfig(overrides: Partial<TodoConfig> = {}): TodoConfig {
  return {
    title: 'Chores',
    accentColor: '#000000',
    items: [
      { id: 'i1', text: 'Take out trash', completed: false },
      { id: 'i2', text: 'Feed the cat', completed: true },
    ],
    ...overrides,
  };
}

/** Render an interactive, fully-addressed todo module. */
function renderInteractive(extra: Partial<TodoConfig> = {}) {
  return render(
    <TodoModule
      config={makeConfig({ interactive: true, ...extra })}
      style={style}
      displayId="kitchen"
      screenId="s1"
      moduleId="m1"
    />,
    { wrapper: Wrapper },
  );
}

beforeEach(() => {
  displayFetch.mockReset();
  mockTodoState = null;
});
afterEach(() => cleanup());

describe('TodoModule', () => {
  it('renders static (no buttons) when not interactive', () => {
    const { container } = render(<TodoModule config={makeConfig()} style={style} />, { wrapper: Wrapper });
    expect(container.querySelectorAll('button')).toHaveLength(0);
  });

  it('renders static when interactive flag is set but instance address is missing', () => {
    // The editor preview passes config.interactive but no screenId/moduleId.
    const { container } = render(<TodoModule config={makeConfig({ interactive: true })} style={style} />, { wrapper: Wrapper });
    expect(container.querySelectorAll('button')).toHaveLength(0);
  });

  it('renders a button per item, reflecting authored completion when no runtime state exists', () => {
    const { container } = renderInteractive();
    const buttons = container.querySelectorAll('button');
    expect(buttons).toHaveLength(2);
    // aria-pressed reflects the authored defaults.
    expect(buttons[0].getAttribute('aria-pressed')).toBe('false');
    expect(buttons[1].getAttribute('aria-pressed')).toBe('true');
  });

  it('merges runtime overrides over authored defaults', () => {
    // i1 was completed at runtime (overriding its authored false); i2 has no
    // runtime entry and falls back to its authored true.
    mockTodoState = { completed: { i1: true } };
    const { container } = renderInteractive();
    const buttons = container.querySelectorAll('button');
    expect(buttons[0].getAttribute('aria-pressed')).toBe('true');
    expect(buttons[1].getAttribute('aria-pressed')).toBe('true');
  });

  it('optimistically flips on click before the request resolves', () => {
    displayFetch.mockReturnValue(new Promise(() => {})); // never resolves
    const { container } = renderInteractive();
    const firstBtn = container.querySelectorAll('button')[0];
    expect(firstBtn.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(firstBtn);
    expect(container.querySelectorAll('button')[0].getAttribute('aria-pressed')).toBe('true');
    // Posted to the toggle endpoint with the full instance address.
    expect(displayFetch).toHaveBeenCalledWith('/api/todo/toggle', expect.objectContaining({ method: 'POST' }));
    const body = JSON.parse(displayFetch.mock.calls[0][1].body);
    expect(body).toMatchObject({ displayId: 'kitchen', screenId: 's1', moduleId: 'm1', itemId: 'i1' });
  });

  it('reconciles to the server completion value on success', async () => {
    displayFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ completed: { i1: true } }),
    });
    const { container } = renderInteractive();
    await act(async () => {
      fireEvent.click(container.querySelectorAll('button')[0]);
    });
    await waitFor(() => {
      expect(container.querySelectorAll('button')[0].getAttribute('aria-pressed')).toBe('true');
    });
  });

  it('reverts only the tapped item when the request fails', async () => {
    displayFetch.mockResolvedValue({ ok: false });
    const { container } = renderInteractive();
    await act(async () => {
      fireEvent.click(container.querySelectorAll('button')[0]);
    });
    await waitFor(() => {
      // Reverted back to its authored uncompleted state.
      expect(container.querySelectorAll('button')[0].getAttribute('aria-pressed')).toBe('false');
    });
    // The sibling (i2) was never touched.
    expect(container.querySelectorAll('button')[1].getAttribute('aria-pressed')).toBe('true');
  });

  it('does not let a stale poll clobber an in-flight optimistic flip (no flicker)', async () => {
    displayFetch.mockReturnValue(new Promise(() => {})); // toggle never resolves → stays in flight
    const { container, rerender } = renderInteractive();

    // Optimistic flip of i1.
    fireEvent.click(container.querySelectorAll('button')[0]);
    expect(container.querySelectorAll('button')[0].getAttribute('aria-pressed')).toBe('true');

    // A poll lands that predates the tap — i1 still shows as not completed.
    // Because the toggle is in flight, the poll must NOT revert the optimistic value.
    mockTodoState = { completed: {} };
    await act(async () => {
      rerender(
        <TodoModule
          config={makeConfig({ interactive: true })}
          style={style}
          displayId="kitchen"
          screenId="s1"
          moduleId="m1"
        />,
      );
    });
    expect(container.querySelectorAll('button')[0].getAttribute('aria-pressed')).toBe('true');
  });

  it('reflects an external completion arriving via a later poll (cross-display sync)', async () => {
    const { container, rerender } = renderInteractive();
    expect(container.querySelectorAll('button')[0].getAttribute('aria-pressed')).toBe('false');

    // Another display toggled i1; the poll surfaces it here.
    mockTodoState = { completed: { i1: true } };
    await act(async () => {
      rerender(
        <TodoModule
          config={makeConfig({ interactive: true })}
          style={style}
          displayId="kitchen"
          screenId="s1"
          moduleId="m1"
        />,
      );
    });
    expect(container.querySelectorAll('button')[0].getAttribute('aria-pressed')).toBe('true');
  });

  it('ignores a double tap while a toggle is in flight', () => {
    displayFetch.mockReturnValue(new Promise(() => {})); // never resolves
    const { container } = renderInteractive();
    const firstBtn = () => container.querySelectorAll('button')[0];
    fireEvent.click(firstBtn());
    fireEvent.click(firstBtn()); // second tap should be ignored
    // Only one request fired, and the item stayed in its single optimistic state.
    expect(displayFetch).toHaveBeenCalledTimes(1);
    expect(firstBtn().getAttribute('aria-pressed')).toBe('true');
  });

  it('holds a confirmed toggle through a stale poll (post-toggle override window)', async () => {
    // The toggle succeeds and the server confirms i1 completed.
    displayFetch.mockResolvedValue({ ok: true, json: async () => ({ completed: { i1: true } }) });
    const { container, rerender } = renderInteractive();
    await act(async () => {
      fireEvent.click(container.querySelectorAll('button')[0]);
    });
    await waitFor(() => {
      expect(container.querySelectorAll('button')[0].getAttribute('aria-pressed')).toBe('true');
    });

    // A poll that read the store BEFORE our write landed arrives with i1 absent.
    // The pending guard is already cleared, but the override window must keep
    // the stale poll from reverting the confirmed completion.
    mockTodoState = { completed: {} };
    await act(async () => {
      rerender(
        <TodoModule
          config={makeConfig({ interactive: true })}
          style={style}
          displayId="kitchen"
          screenId="s1"
          moduleId="m1"
        />,
      );
    });
    expect(container.querySelectorAll('button')[0].getAttribute('aria-pressed')).toBe('true');
  });

  it('drops runtime overrides from the rendered items when interactive is turned off', async () => {
    // i1 was completed at runtime while interactive.
    mockTodoState = { completed: { i1: true } };
    const { container, rerender } = renderInteractive();
    expect(container.querySelectorAll('button')[0].getAttribute('aria-pressed')).toBe('true');

    // Admin disables tap mode in the editor; the config poll delivers interactive:false.
    await act(async () => {
      rerender(
        <TodoModule
          config={makeConfig({ interactive: false })}
          style={style}
          displayId="kitchen"
          screenId="s1"
          moduleId="m1"
        />,
      );
    });
    // Now static (no buttons) and the first item reflects its AUTHORED default
    // (not completed → no strikethrough), not the stale runtime override.
    expect(container.querySelectorAll('button')).toHaveLength(0);
    const firstSpan = container.querySelector('.line-clamp-2') as HTMLElement;
    expect(firstSpan.style.textDecoration).toBe('none');
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

describe('TodoModule touch treatment', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeLocalStorage());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('static lists keep the small check glyph; interactive lists get the tap checkbox', () => {
    const plain = render(<TodoModule config={makeConfig()} style={style} />, { wrapper: Wrapper });
    expect(plain.queryAllByTestId('tap-checkbox')).toHaveLength(0);
    expect(plain.queryByTestId('todo-tap-hint')).toBeNull();
    plain.unmount();

    const { getAllByTestId } = renderInteractive();
    const boxes = getAllByTestId('tap-checkbox');
    expect(boxes).toHaveLength(2);
    expect(boxes[0].style.width).toBe('38px');
    expect(boxes[0].hasAttribute('data-checked')).toBe(false);
    expect(boxes[1].hasAttribute('data-checked')).toBe(true);
    // The authored black accent is swapped for a visible fill on the checked box.
    expect(boxes[1].style.backgroundColor).toBe('rgb(59, 130, 246)');
  });

  it('marks the row and box pressed while the toggle request is in flight', async () => {
    let settle: (value: Response) => void = () => {};
    displayFetch.mockReturnValue(new Promise<Response>((resolve) => { settle = resolve; }));
    const { getByRole, getAllByTestId } = renderInteractive();
    const row = getByRole('button', { name: /Take out trash/ });
    fireEvent.click(row);
    expect(row.hasAttribute('data-pressed')).toBe(true);
    expect(getAllByTestId('tap-checkbox')[0].hasAttribute('data-pressed')).toBe(true);

    await act(async () => {
      settle({ ok: true, json: async () => ({ completed: { i1: true } }) } as unknown as Response);
    });
    await waitFor(() => expect(row.hasAttribute('data-pressed')).toBe(false));
    expect(getAllByTestId('tap-checkbox')[0].hasAttribute('data-checked')).toBe(true);
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
