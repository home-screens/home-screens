'use client';

import { useState, useCallback, useMemo } from 'react';
import { usePolledFetch } from '@/hooks/usePolledFetch';
import type { VersionResponse } from '@/lib/version';
import type { UpdateNotificationState } from '@/lib/update-notification-state';

type FetchFn = (url: string, options?: RequestInit) => Promise<Response>;

interface UseUpdateNotificationOptions {
  enabled: boolean;
  /** Override fetch for auth-aware wrappers like editorFetch. Defaults to window.fetch. */
  fetchFn?: FetchFn;
  /** Re-check version + dismissal state on this interval (ms). Defaults to 3_600_000 (1 hour). */
  pollIntervalMs?: number;
  /** Mirrors the user's updateChannel setting — defaults to 'stable'. */
  channel?: 'stable' | 'dev';
}

interface UseUpdateNotificationResult {
  shouldShow: boolean;
  latestVersion: string | null;  // e.g. "1.6.0" (no v prefix)
  latestTag: string | null;       // e.g. "v1.6.0" — what we persist on dismiss
  currentVersion: string | null;
  handleDismiss: () => void;      // optimistic; POSTs in the background
}

export function useUpdateNotification({
  enabled,
  fetchFn = fetch,
  pollIntervalMs = 3_600_000,
  channel = 'stable',
}: UseUpdateNotificationOptions): UseUpdateNotificationResult {
  const [versionInfo, setVersionInfo] = useState<VersionResponse | null>(null);
  const [lastDismissedVersion, setLastDismissedVersion] = useState<string | null>(null);

  // Poll version + dismissal together so:
  //  (1) a newly published tag re-surfaces after the user dismissed an older one
  //      — the server-side lastDismissedVersion stays anchored to the old tag,
  //      so on the next tick latestTag !== lastDismissedVersion and the toast returns.
  //  (2) a dismissal on one surface (editor toast) propagates to the other
  //      (remote banner) within one poll tick.
  usePolledFetch(
    async (isMounted) => {
      try {
        const [vRes, dRes] = await Promise.all([
          fetchFn(`/api/system/version?channel=${channel}`),
          fetchFn('/api/system/update-notification'),
        ]);
        if (vRes.ok) {
          const data = await vRes.json() as VersionResponse;
          if (isMounted()) setVersionInfo(data);
        }
        if (dRes.ok) {
          const state = await dRes.json() as UpdateNotificationState;
          if (isMounted()) setLastDismissedVersion(state.lastDismissedVersion);
        }
      } catch {
        // Not critical
      }
    },
    [fetchFn, channel],
    { enabled, intervalMs: pollIntervalMs },
  );

  const latestVersion = versionInfo?.latest ?? null;
  const latestTag = versionInfo?.tags?.[0]?.tag ?? null;
  const currentVersion = versionInfo?.current ?? null;

  const shouldShow = useMemo(() => {
    if (!enabled) return false;
    if (!versionInfo?.updateAvailable) return false;
    if (latestTag == null) return false;
    if (latestTag === lastDismissedVersion) return false;
    return true;
  }, [enabled, versionInfo?.updateAvailable, latestTag, lastDismissedVersion]);

  const handleDismiss = useCallback(() => {
    if (latestTag == null) return;
    // Optimistic: flip shouldShow immediately by mirroring what we expect the
    // server to persist. If the POST fails, the next poll will restore the
    // server's previous value and the toast will return — which is the
    // correct behavior since the user's intent didn't actually land.
    setLastDismissedVersion(latestTag);
    fetchFn('/api/system/update-notification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'dismiss', version: latestTag }),
    }).catch(() => {});
  }, [fetchFn, latestTag]);

  return { shouldShow, latestVersion, latestTag, currentVersion, handleDismiss };
}
