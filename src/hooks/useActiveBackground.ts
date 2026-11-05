'use client';

import { useState, useEffect, useRef } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import { usePolledFetch } from '@/hooks/usePolledFetch';
import { logger } from '@/lib/logger';
import { useEditorStore } from '@/stores/editor-store';
import { eventBus } from '@/lib/event-bus';
import type { RotationAnswer } from '@/lib/screen-background';


const log = logger('useActiveBackground');

/**
 * Polls the server-side background cache so the editor shows the same rotating
 * background the display is using. Returns null when rotation is disabled and
 * undefined until the screen's first answer is in (see resolveScreenBackground).
 *
 * Answers are kept per screen, so a screen never shows the photo of the one
 * selected before it, and going back to a screen shows its photo at once.
 */
export function useActiveBackground(screenId: string | undefined, rotationEnabled: boolean, rotationKey?: string): RotationAnswer {
  const [answers, setAnswers] = useState<Record<string, string | null>>({});
  const record = (id: string, answer: string | null) =>
    setAnswers((prev) => (prev[id] === answer ? prev : { ...prev, [id]: answer }));

  useEffect(() => {
    return eventBus.subscribe('background.forceRefresh', (data) => {
      if (data.screenId === screenId) record(data.screenId, data.path);
    });
  }, [screenId]);

  const fetchAnswer = async (id: string) => {
    try {
      // A rotation may download the next picture, under the hub's own limits.
      const res = await editorFetch(`/api/backgrounds/rotate?screenId=${encodeURIComponent(id)}`, { timeoutMs: null });
      if (res.ok) {
        const data = await res.json();
        record(id, data.path || null);
        return;
      }
    } catch (err) {
      log.debug('Failed to fetch active background:', err);
    }
    // A failed lookup keeps the last answer; before one, the screen's own picture stands.
    setAnswers((prev) => (id in prev ? prev : { ...prev, [id]: null }));
  };

  // A changed rotation setting (sources, tiles, filters) should show up within
  // seconds, not on the next 30 s poll. The hub answers from the saved
  // config, so the ask waits for the save that carries the change to land
  // (the store is clean and not saving) rather than a fixed moment.
  const lastKey = useRef(rotationKey);
  const [askFor, setAskFor] = useState<string | null>(null);
  useEffect(() => {
    if (lastKey.current === rotationKey) return;
    lastKey.current = rotationKey;
    if (!screenId || !rotationEnabled) return;
    setAskFor(screenId);
  }, [rotationKey, screenId, rotationEnabled]);
  const settled = useEditorStore((state) => !state.isDirty && !state.isSaving);
  useEffect(() => {
    if (!askFor || !settled) return;
    setAskFor(null);
    void fetchAnswer(askFor);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchAnswer only closes over stable setters
  }, [askFor, settled]);

  usePolledFetch(
    () => fetchAnswer(screenId!),
    [screenId],
    {
      intervalMs: 30_000,
      enabled: rotationEnabled && !!screenId,
      // With rotation off the canvas shows the screen's own picture. Recording
      // that as its answer keeps the picture up when rotation is switched on,
      // until the first photo arrives, instead of blanking it for the lookup.
      onSkip: () => {
        if (screenId) record(screenId, null);
      },
    },
  );

  if (!screenId || !rotationEnabled) return null;
  return answers[screenId];
}
