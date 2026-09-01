'use client';

import { useEffect, useState } from 'react';
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

  useEffect(() => {
    let mounted = true;
    let lastForeign: string | null = null;

    async function tick() {
      if (document.visibilityState !== 'visible') return;
      const before = useEditorStore.getState();
      if (!before.configRevision || before.isSaving || before.isDirty || before.saveConflict) {
        lastForeign = null;
        return;
      }
      try {
        const res = await editorFetch('/api/config', { method: 'HEAD' });
        if (!mounted || !res.ok) return;
        const seen = res.headers.get(CONFIG_REVISION_HEADER);
        const after = useEditorStore.getState();
        if (!seen || seen === after.configRevision || after.isSaving || after.isDirty) {
          lastForeign = null;
          setRemoteChanged(false);
          return;
        }
        if (lastForeign === seen) setRemoteChanged(true);
        else lastForeign = seen;
      } catch {
        // Offline: the save path reports that; nothing to flag here.
      }
    }

    const id = setInterval(tick, POLL_MS);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  // A reload (or a resolved conflict) moves the store onto the new revision.
  useEffect(() => {
    setRemoteChanged(false);
  }, [configRevision]);

  return remoteChanged;
}
