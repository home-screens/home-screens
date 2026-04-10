'use client';

import { useEffect } from 'react';
import { detectScope } from '@/lib/theme';

/**
 * Listens to OS theme changes and re-resolves `data-theme` when
 * the user has chosen "system". Mounted once in the root layout.
 */
export default function ThemeListener() {
  useEffect(() => {
    const key = detectScope() === 'remote' ? 'hs-theme-remote' : 'hs-theme';
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const handler = (e: MediaQueryListEvent) => {
      if (localStorage.getItem(key) !== 'system') return;
      document.documentElement.setAttribute('data-theme', e.matches ? 'light' : 'dark');
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return null;
}
