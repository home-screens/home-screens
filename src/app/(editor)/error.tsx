'use client';

import { useEffect } from 'react';
import TranslatedRouteError from '@/components/TranslatedRouteError';
import { useEditorStore } from '@/stores/editor-store';

export default function RouteError({ error }: { error: Error & { digest?: string } }) {
  // The layout, and the auto-save in it, outlive the page that threw. The
  // draft in the store is the one that could not be drawn, so it is held
  // back from the hub and the hub's copy loaded in its place: the reload the
  // error screen does, or browser Back, then returns to the last saved
  // setup, as a crash always has.
  useEffect(() => {
    void useEditorStore.getState().discardDraft();
  }, []);
  return <TranslatedRouteError error={error} />;
}
