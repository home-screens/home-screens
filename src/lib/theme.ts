export type ThemeChoice = 'light' | 'dark' | 'system';
export type ThemeScope = 'editor' | 'remote';

const STORAGE_KEY: Record<ThemeScope, string> = {
  editor: 'hs-theme',
  remote: 'hs-theme-remote',
};

/** Detect scope from the current URL path. */
export function detectScope(): ThemeScope {
  if (typeof window === 'undefined') return 'editor';
  const p = window.location.pathname;
  return p.startsWith('/remote') || p.startsWith('/chores') ? 'remote' : 'editor';
}

export function getThemeChoice(scope?: ThemeScope): ThemeChoice {
  if (typeof window === 'undefined') return 'dark';
  const key = STORAGE_KEY[scope ?? detectScope()];
  const stored = localStorage.getItem(key);
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'dark';
}

export function setThemeChoice(choice: ThemeChoice, scope?: ThemeScope): void {
  const key = STORAGE_KEY[scope ?? detectScope()];
  localStorage.setItem(key, choice);
  const resolved =
    choice === 'system'
      ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
      : choice;
  document.documentElement.setAttribute('data-theme', resolved);
}
