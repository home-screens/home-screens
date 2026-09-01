import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Dynamic import to get a fresh store for each test
let useAlertStore: typeof import('@/stores/alert-store').useAlertStore;

beforeEach(async () => {
  vi.useFakeTimers();
  // Reset module to get a fresh Zustand store + counter + timers Map
  vi.resetModules();
  const mod = await import('@/stores/alert-store');
  useAlertStore = mod.useAlertStore;
});

afterEach(() => {
  vi.useRealTimers();
});

function store() {
  return useAlertStore.getState();
}

describe('showAlert', () => {
  it('adds an alert with generated id', () => {
    store().showAlert({ type: 'info', title: 'Hi', message: '' });
    expect(store().alerts).toHaveLength(1);
    expect(store().alerts[0]).toMatchObject({
      type: 'info',
      title: 'Hi',
      message: '',
      dismissible: true,
    });
    expect(store().alerts[0].id).toMatch(/^alert-/);
  });

  it('uses explicit duration over type default', () => {
    store().showAlert({ type: 'info', title: 'X', message: '', duration: 5000 });
    expect(store().alerts[0].duration).toBe(5000);
  });

  it('uses config defaultDuration over type default when set', () => {
    store().configure({ defaultDuration: 20_000 });
    store().showAlert({ type: 'info', title: 'X', message: '' });
    expect(store().alerts[0].duration).toBe(20_000);
  });

  it('uses type default when config defaultDuration is 0', () => {
    store().configure({ defaultDuration: 0 });
    store().showAlert({ type: 'warning', title: 'X', message: '' });
    expect(store().alerts[0].duration).toBe(30_000);
  });

  it('explicit duration beats config defaultDuration', () => {
    store().configure({ defaultDuration: 20_000 });
    store().showAlert({ type: 'info', title: 'X', message: '', duration: 3000 });
    expect(store().alerts[0].duration).toBe(3000);
  });

  it('does not add alert when disabled', () => {
    store().configure({ enabled: false });
    store().showAlert({ type: 'info', title: 'X', message: '' });
    expect(store().alerts).toHaveLength(0);
  });

  it('defaults dismissible to true', () => {
    store().showAlert({ type: 'info', title: 'X', message: '' });
    expect(store().alerts[0].dismissible).toBe(true);
  });

  it('respects explicit dismissible: false', () => {
    store().showAlert({ type: 'urgent', title: 'X', message: '', dismissible: false });
    expect(store().alerts[0].dismissible).toBe(false);
  });

  it('passes icon through', () => {
    store().showAlert({ type: 'info', title: 'X', message: '', icon: '🔔' });
    expect(store().alerts[0].icon).toBe('🔔');
  });

  it('urgent alerts have duration 0 (persistent) by default', () => {
    store().showAlert({ type: 'urgent', title: 'X', message: '' });
    expect(store().alerts[0].duration).toBe(0);
  });
});

describe('auto-dismiss', () => {
  it('removes alert after duration expires', () => {
    store().showAlert({ type: 'info', title: 'X', message: '' });
    expect(store().alerts).toHaveLength(1);

    vi.advanceTimersByTime(10_000);
    expect(store().alerts).toHaveLength(0);
  });

  it('does not auto-dismiss persistent alerts (duration 0)', () => {
    store().showAlert({ type: 'urgent', title: 'X', message: '' });
    vi.advanceTimersByTime(60_000);
    expect(store().alerts).toHaveLength(1);
  });

  // The remote's "Persistent" duration button sends a literal 0 for whatever
  // type the user picked. It has to stay persistent for info and warning too,
  // not just urgent — 0 must not be treated as "no duration given", which
  // would silently fall back to the 10s / 30s type defaults.
  for (const type of ['info', 'warning'] as const) {
    it(`keeps an explicit duration 0 persistent for ${type} alerts`, () => {
      store().showAlert({ type, title: 'X', message: '', duration: 0 });
      expect(store().alerts[0].duration).toBe(0);
      vi.advanceTimersByTime(60_000);
      expect(store().alerts).toHaveLength(1);
    });
  }

  it('lets an explicit duration 0 override a configured defaultDuration', () => {
    store().configure({ defaultDuration: 15_000 });
    store().showAlert({ type: 'info', title: 'X', message: '', duration: 0 });
    vi.advanceTimersByTime(60_000);
    expect(store().alerts).toHaveLength(1);
  });

  it('clears timer on manual dismiss', () => {
    store().showAlert({ type: 'info', title: 'X', message: '' });
    const id = store().alerts[0].id;

    store().dismissAlert(id);
    expect(store().alerts).toHaveLength(0);

    // Stale timer should not cause issues
    vi.advanceTimersByTime(10_000);
    expect(store().alerts).toHaveLength(0);
  });
});

describe('dismissAlert', () => {
  it('removes alert by id', () => {
    // Two persistent banners (a second urgent would replace the first).
    store().showAlert({ type: 'warning', title: 'A', message: '', duration: 0 });
    store().showAlert({ type: 'warning', title: 'B', message: '', duration: 0 });
    const idA = store().alerts[0].id;

    store().dismissAlert(idA);
    expect(store().alerts).toHaveLength(1);
    expect(store().alerts[0].title).toBe('B');
  });

  it('no-ops for unknown id without state update', () => {
    store().showAlert({ type: 'urgent', title: 'A', message: '' });
    const alertsBefore = store().alerts;

    store().dismissAlert('nonexistent');
    // Same reference — no state update triggered
    expect(store().alerts).toBe(alertsBefore);
  });
});

describe('clearAlerts', () => {
  it('removes all alerts', () => {
    store().showAlert({ type: 'warning', title: 'A', message: '', duration: 0 });
    store().showAlert({ type: 'urgent', title: 'B', message: '' });
    expect(store().alerts).toHaveLength(2);

    store().clearAlerts();
    expect(store().alerts).toHaveLength(0);
  });

  it('clears pending auto-dismiss timers', () => {
    store().showAlert({ type: 'info', title: 'X', message: '' });
    store().clearAlerts();
    expect(store().alerts).toHaveLength(0);

    // Stale timer should not cause issues
    vi.advanceTimersByTime(10_000);
    expect(store().alerts).toHaveLength(0);
  });

  it('no-ops when already empty', () => {
    const alertsBefore = store().alerts;
    store().clearAlerts();
    expect(store().alerts).toBe(alertsBefore);
  });
});

describe('configure', () => {
  it('partially updates settings', () => {
    store().configure({ maxVisible: 5 });
    expect(store().maxVisible).toBe(5);
    expect(store().position).toBe('top'); // unchanged
  });

  it('preserves alerts array', () => {
    store().showAlert({ type: 'urgent', title: 'X', message: '' });
    store().configure({ position: 'bottom' });
    expect(store().alerts).toHaveLength(1);
    expect(store().position).toBe('bottom');
  });

  it('updates all fields at once', () => {
    store().configure({
      maxVisible: 7,
      position: 'bottom',
      enabled: false,
      defaultDuration: 15_000,
    });
    expect(store().maxVisible).toBe(7);
    expect(store().position).toBe('bottom');
    expect(store().enabled).toBe(false);
    expect(store().defaultDuration).toBe(15_000);
  });
});

describe('urgent alerts', () => {
  it('a newer urgent alert replaces the older one instead of stacking', () => {
    store().showAlert({ type: 'urgent', title: 'First', message: '' });
    store().showAlert({ type: 'info', title: 'Routine', message: '', duration: 0 });
    store().showAlert({ type: 'urgent', title: 'Second', message: '' });
    const titles = store().alerts.map((a) => a.title);
    expect(titles).toEqual(['Routine', 'Second']);
  });

  it('clears the replaced urgent alert’s timer', () => {
    store().showAlert({ type: 'urgent', title: 'First', message: '', duration: 1000 });
    store().showAlert({ type: 'urgent', title: 'Second', message: '' });
    vi.advanceTimersByTime(1500);
    expect(store().alerts.map((a) => a.title)).toEqual(['Second']);
  });

  it('carries the wake flag through', () => {
    store().showAlert({ type: 'warning', title: 'Bus', message: '', wake: true });
    expect(store().alerts[0].wake).toBe(true);
  });
});

describe('splitAlerts', () => {
  it('separates the urgent bar from the banners and caps only the banners', async () => {
    const { splitAlerts } = await import('@/stores/alert-store');
    const mk = (type: 'info' | 'warning' | 'urgent', title: string) => ({ id: title, type, title, message: '' });
    const { urgent, banners } = splitAlerts([mk('info', 'a'), mk('urgent', 'U'), mk('info', 'b'), mk('warning', 'c')], 2);
    expect(urgent?.title).toBe('U');
    expect(banners.map((b) => b.title)).toEqual(['b', 'c']);
  });

  it('returns no urgent when none is present', async () => {
    const { splitAlerts } = await import('@/stores/alert-store');
    expect(splitAlerts([], 3)).toEqual({ urgent: null, banners: [] });
  });
});

describe('setUrgentInset', () => {
  it('stores the rounded height and ignores no-op writes', () => {
    store().setUrgentInset(185.6);
    expect(store().urgentInsetPx).toBe(186);
    const before = useAlertStore.getState();
    store().setUrgentInset(186.2);
    expect(useAlertStore.getState()).toBe(before);
    store().setUrgentInset(-5);
    expect(store().urgentInsetPx).toBe(0);
  });
});
