import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getThemeChoice, setThemeChoice, detectScope } from '@/lib/theme';

/* -------------------------------------------------------------------------- */
/*  Minimal browser stubs — the test environment is `node`, not `jsdom`.      */
/* -------------------------------------------------------------------------- */

function makeLocalStorage() {
  const store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, val: string) => { store[key] = val; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
  };
}

let dataTheme: string | null = null;

function stubWindow(pathname = '/editor') {
  const mm = vi.fn().mockReturnValue({ matches: false });
  vi.stubGlobal('window', { matchMedia: mm, location: { pathname } });
  vi.stubGlobal('matchMedia', mm);
  return mm;
}

beforeEach(() => {
  dataTheme = null;
  const ls = makeLocalStorage();
  vi.stubGlobal('localStorage', ls);
  vi.stubGlobal('document', {
    documentElement: {
      setAttribute: vi.fn((_: string, v: string) => { dataTheme = v; }),
      getAttribute: vi.fn(() => dataTheme),
    },
  });
  stubWindow('/editor');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/* -------------------------------------------------------------------------- */

describe('detectScope', () => {
  it('returns "editor" for /editor paths', () => {
    stubWindow('/editor/settings');
    expect(detectScope()).toBe('editor');
  });

  it('returns "remote" for /remote paths', () => {
    stubWindow('/remote');
    expect(detectScope()).toBe('remote');
  });

  it('returns "remote" for /chores paths', () => {
    stubWindow('/chores');
    expect(detectScope()).toBe('remote');
  });

  it('returns "editor" when window is undefined (SSR)', () => {
    vi.stubGlobal('window', undefined);
    expect(detectScope()).toBe('editor');
  });
});

/* -------------------------------------------------------------------------- */

describe('getThemeChoice', () => {
  it('returns "dark" when localStorage has no key', () => {
    expect(getThemeChoice()).toBe('dark');
  });

  it('returns "dark" for an invalid stored value', () => {
    localStorage.setItem('hs-theme', 'purple');
    expect(getThemeChoice('editor')).toBe('dark');
  });

  it('returns "light" when stored for editor', () => {
    localStorage.setItem('hs-theme', 'light');
    expect(getThemeChoice('editor')).toBe('light');
  });

  it('returns "dark" when stored for editor', () => {
    localStorage.setItem('hs-theme', 'dark');
    expect(getThemeChoice('editor')).toBe('dark');
  });

  it('returns "system" when stored for editor', () => {
    localStorage.setItem('hs-theme', 'system');
    expect(getThemeChoice('editor')).toBe('system');
  });

  it('reads remote key for remote scope', () => {
    localStorage.setItem('hs-theme-remote', 'light');
    expect(getThemeChoice('remote')).toBe('light');
  });

  it('editor and remote keys are independent', () => {
    localStorage.setItem('hs-theme', 'light');
    localStorage.setItem('hs-theme-remote', 'dark');
    expect(getThemeChoice('editor')).toBe('light');
    expect(getThemeChoice('remote')).toBe('dark');
  });

  it('returns "dark" when window is undefined (SSR)', () => {
    vi.stubGlobal('window', undefined);
    expect(getThemeChoice()).toBe('dark');
  });
});

describe('setThemeChoice', () => {
  it('stores "light" and sets data-theme to "light" (editor)', () => {
    setThemeChoice('light', 'editor');
    expect(localStorage.setItem).toHaveBeenCalledWith('hs-theme', 'light');
    expect(document.documentElement.setAttribute).toHaveBeenCalledWith('data-theme', 'light');
  });

  it('stores "dark" and sets data-theme to "dark" (editor)', () => {
    setThemeChoice('dark', 'editor');
    expect(localStorage.setItem).toHaveBeenCalledWith('hs-theme', 'dark');
    expect(document.documentElement.setAttribute).toHaveBeenCalledWith('data-theme', 'dark');
  });

  it('stores to remote key for remote scope', () => {
    setThemeChoice('light', 'remote');
    expect(localStorage.setItem).toHaveBeenCalledWith('hs-theme-remote', 'light');
    expect(document.documentElement.setAttribute).toHaveBeenCalledWith('data-theme', 'light');
  });

  it('stores "system" and resolves to "light" when OS prefers light', () => {
    const mm = vi.fn().mockReturnValue({ matches: true });
    vi.stubGlobal('matchMedia', mm);
    vi.stubGlobal('window', { matchMedia: mm, location: { pathname: '/editor' } });
    setThemeChoice('system', 'editor');
    expect(localStorage.setItem).toHaveBeenCalledWith('hs-theme', 'system');
    expect(document.documentElement.setAttribute).toHaveBeenCalledWith('data-theme', 'light');
  });

  it('stores "system" and resolves to "dark" when OS prefers dark', () => {
    const mm = vi.fn().mockReturnValue({ matches: false });
    vi.stubGlobal('matchMedia', mm);
    vi.stubGlobal('window', { matchMedia: mm, location: { pathname: '/editor' } });
    setThemeChoice('system', 'editor');
    expect(localStorage.setItem).toHaveBeenCalledWith('hs-theme', 'system');
    expect(document.documentElement.setAttribute).toHaveBeenCalledWith('data-theme', 'dark');
  });
});
