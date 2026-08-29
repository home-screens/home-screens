'use client';

import { useEffect, useRef } from 'react';
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
