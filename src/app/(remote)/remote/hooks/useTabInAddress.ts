'use client';

import { useEffect, useRef } from 'react';

/**
 * Mirrors the tab that is showing into the address (`?tab=`), so a reload or
 * a shared link opens the same tab. The home tab is the bare address.
 *
 * The history entry's state is kept as it is: an overlay that is up holds
 * its entry through that state (`useBackGesture`), and one wiped here is
 * never given back, which leaves a Back press that does nothing.
 *
 * It runs again after every step through history. A card that was up when
 * the tab changed gives its entry back by stepping to the one under it, and
 * that entry still names the tab the card was opened on. A step that lands
 * on another page (Back out of the remote, which the app can take without
 * loading a new document) is not this page's address to write.
 */
export function useTabInAddress(activeTab: string): void {
  const page = useRef<string | null>(null);
  useEffect(() => {
    page.current ??= window.location.pathname;
    const sync = () => {
      if (window.location.pathname !== page.current) return;
      const url = new URL(window.location.href);
      if ((url.searchParams.get('tab') ?? 'control') === activeTab) return;
      if (activeTab === 'control') url.searchParams.delete('tab');
      else url.searchParams.set('tab', activeTab);
      window.history.replaceState(window.history.state, '', url);
    };
    sync();
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, [activeTab]);
}
