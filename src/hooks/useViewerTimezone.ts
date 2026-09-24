'use client';

import { useSyncExternalStore } from 'react';

const noSubscription = () => () => {};
const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const unknownOnServer = () => null;

/**
 * The zone of the browser or phone looking at the page, or null while the page
 * is still being drawn by the server (which cannot know it). Only for saying
 * that the viewer's own clock differs from home: every time the app shows or
 * saves is in the household's zone, never this one.
 */
export function useViewerTimezone(): string | null {
  return useSyncExternalStore(noSubscription, browserZone, unknownOnServer);
}
