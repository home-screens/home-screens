'use client';

import { useEffect, useRef, useState } from 'react';
import { usePolledFetch } from './usePolledFetch';
import { useEditorStore } from '@/stores/editor-store';
import { editorFetch } from '@/lib/editor-fetch';
import { CONFIG_REVISION_HEADER } from '@/lib/config-revision';

const POLL_MS = 5_000;

/**
 * Notices when the config changed somewhere else while this editor sits
 * idle (a phone on /remote, another laptop, a rule or a restore), so the
 * toolbar can offer a reload instead of letting the next edit start from a
 * stale layout and trip the save conflict.
 *
 * Only a clean, idle editor is watched: once there are unsaved edits the
 * save itself detects the change (409) and the conflict banner takes over.
 * A foreign revision has to be seen on two consecutive polls before it
 * counts, so our own save landing between the poll and the store update
 * can never read as someone else's change.
 */
export function useRemoteConfigWatch(): boolean {
  const [remoteChanged, setRemoteChanged] = useState(false);
  const configRevision = useEditorStore((s) => s.configRevision);

  const lastForeign = useRef<string | null>(null);

  usePolledFetch(async (isMounted, reason) => {
    // Coming back online polls at once, perhaps a moment after another poll:
    // two that close together are not the two separate sightings the rule
    // above asks for, so that one is left to the next tick.
    if (reason === 'online') return;
    const before = useEditorStore.getState();
    if (!before.configRevision || before.isSaving || before.isDirty || before.saveConflict) {
      lastForeign.current = null;
      return;
    }
    try {
      const res = await editorFetch('/api/config', { method: 'HEAD' });
      // Read the empty body so the request completes: Chromium cancels a
      // response nobody reads, and every poll then logs as an aborted
      // request in the network panel.
      await res.text().catch(() => {});
      if (!isMounted() || !res.ok) return;
      const seen = res.headers.get(CONFIG_REVISION_HEADER);
      const after = useEditorStore.getState();
      if (!seen || seen === after.configRevision || after.isSaving || after.isDirty) {
        lastForeign.current = null;
        setRemoteChanged(false);
        return;
      }
      if (lastForeign.current === seen) setRemoteChanged(true);
      else lastForeign.current = seen;
    } catch {
      // Offline: the save path reports that; nothing to flag here.
    }
  }, [], { intervalMs: POLL_MS, pauseWhenHidden: true });

  // A reload (or a resolved conflict) moves the store onto the new revision.
  useEffect(() => {
    setRemoteChanged(false);
  }, [configRevision]);

  return remoteChanged;
}
