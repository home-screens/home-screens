'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { NewsDisplayItem } from '@/lib/news/types';
import type { ViewCommand } from './news-view-types';

/**
 * React to a routed command exactly once per `seq`. Handlers may change on
 * every render; only a new command triggers a call.
 */
export function useViewCommand(
  command: ViewCommand | null,
  handlers: Partial<Record<'next' | 'prev' | 'details', () => void>>,
): void {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const lastSeq = useRef<number>(command?.seq ?? 0);

  useEffect(() => {
    if (!command || command.seq === lastSeq.current) return;
    lastSeq.current = command.seq;
    const fn = handlersRef.current[command.action as 'next' | 'prev' | 'details'];
    fn?.();
  }, [command]);
}

/**
 * The picture to show for a story, stepping down to whatever the feed
 * originally advertised if a rewritten higher-resolution URL fails to load
 * (`lib/news/image-upscale.ts`). Only once every candidate has failed does
 * the caller fall back to its placeholder, so a stale rewrite rule costs a
 * retry rather than the picture.
 */
export function useStoryImage(
  item: Pick<NewsDisplayItem, 'imageUrl' | 'imageUrlOriginal'>,
): { src: string | null; onError: () => void } {
  const { imageUrl, imageUrlOriginal } = item;
  const candidates = useMemo(() => {
    const out: string[] = [];
    if (imageUrl) out.push(imageUrl);
    if (imageUrlOriginal && imageUrlOriginal !== imageUrl) out.push(imageUrlOriginal);
    return out;
  }, [imageUrl, imageUrlOriginal]);

  const [step, setStep] = useState(0);
  useEffect(() => { setStep(0); }, [candidates]);

  return {
    src: candidates[step] ?? null,
    onError: () => setStep((s) => s + 1),
  };
}
