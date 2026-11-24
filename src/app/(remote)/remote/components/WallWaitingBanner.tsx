'use client';

import { useCallback, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { useTranslate } from '@/i18n';
import { editorFetch } from '@/lib/editor-fetch';
import { usePolledFetch } from '@/hooks/usePolledFetch';
import { settingsPath } from '@/lib/settings-route';
import { wallBrowserName } from '@/lib/wall-names';
import type { WallsApiResponse } from '@/lib/walls-api-types';

/**
 * Tells a grown-up, on the phone they are holding, that a wall is waiting
 * to be let in. Letting it in is done in the editor, so the whole line is a
 * link there. Shows nothing on a hub with no password, where nothing waits.
 */
export default function WallWaitingBanner() {
  const t = useTranslate('remote');
  const tCore = useTranslate('core');
  const [data, setData] = useState<WallsApiResponse | null>(null);

  const poll = useCallback(async (isMounted: () => boolean) => {
    try {
      const res = await editorFetch('/api/display/walls');
      if (res.ok && isMounted()) setData((await res.json()) as WallsApiResponse);
    } catch {
      // Keep what we had; the next turn tries again.
    }
  }, []);
  usePolledFetch(poll, [], { intervalMs: 15_000, pauseWhenHidden: true });

  const waiting = (data?.walls ?? []).filter((w) => w.status === 'waiting');
  if (waiting.length === 0) return null;

  return (
    <a
      href={settingsPath({ kind: 'displays' })}
      data-testid="wall-waiting-banner"
      className="press-btn mx-4 mt-2 rounded-xl border border-hs-warning/30 bg-hs-warning/[0.08] px-4 py-3 flex items-center gap-3 min-h-[56px] no-underline"
    >
      <div className="flex-1 min-w-0">
        <div className="text-[15px] font-semibold text-hs-warning-ink">{t('wallWaiting.title', { count: waiting.length })}</div>
        <div className="text-[13px] text-hs-text-muted truncate">
          {waiting.length === 1 ? wallBrowserName(tCore, waiting[0]) : t('wallWaiting.openEditor')}
        </div>
      </div>
      <ChevronRight size={20} aria-hidden="true" style={{ color: 'var(--hs-text-muted)' }} />
    </a>
  );
}
