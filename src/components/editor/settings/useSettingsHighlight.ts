'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

/**
 * Scroll to and briefly pulse the field named by `?highlight=` — the
 * destination of a field-level sidebar search result. Several Defaults
 * pages (System, Data, ...) fetch their own data and render a loading
 * placeholder before the real field markup mounts, so the target's
 * `data-field-id` element isn't necessarily in the DOM on the first
 * paint after `router.push` — this polls briefly rather than checking
 * once. Stripped back out of the URL once the pulse finishes so
 * revisiting the page later, or hitting back/forward, doesn't replay it.
 */
export function useSettingsHighlight(): void {
  const router = useRouter();
  const searchParams = useSearchParams();
  const highlightFieldId = searchParams?.get('highlight') ?? null;

  useEffect(() => {
    if (!highlightFieldId) return;
    let cancelled = false;
    let classTimer: ReturnType<typeof setTimeout> | null = null;
    let stripTimer: ReturnType<typeof setTimeout> | null = null;

    const selector = `[data-field-id="${CSS.escape(highlightFieldId)}"]`;
    const tryHighlight = () => {
      const el = document.querySelector(selector);
      if (!el) return false;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('animate-settings-highlight');
      classTimer = setTimeout(() => el.classList.remove('animate-settings-highlight'), 1800);
      stripTimer = setTimeout(() => {
        // Rebuilt from window.location at fire time, not the searchParams
        // snapshot: `syncEditorUrl` writes `display=` / `screen=` via raw
        // history.replaceState during the pulse window, and replacing with
        // the stale snapshot would silently drop them.
        const params = new URLSearchParams(window.location.search);
        params.delete('highlight');
        router.replace(`?${params.toString()}`);
      }, 1800);
      return true;
    };

    let pollId: ReturnType<typeof setInterval> | null = null;
    if (!tryHighlight()) {
      const deadline = Date.now() + 3000;
      pollId = setInterval(() => {
        if (cancelled || tryHighlight() || Date.now() > deadline) {
          if (pollId) clearInterval(pollId);
        }
      }, 100);
    }

    return () => {
      cancelled = true;
      if (pollId) clearInterval(pollId);
      if (classTimer) clearTimeout(classTimer);
      if (stripTimer) clearTimeout(stripTimer);
    };
  }, [highlightFieldId, searchParams, router]);
}
