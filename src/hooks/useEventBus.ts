'use client';

import { useState, useEffect } from 'react';
import { eventBus } from '@/lib/event-bus';
import type { EventMap } from '@/lib/event-bus';

/** Subscribe to an event bus channel. Returns the latest value, or `null` if nothing published yet. */
export function useEventBus<K extends keyof EventMap>(channel: K): EventMap[K] | null {
  const [value, setValue] = useState<EventMap[K] | null>(
    () => eventBus.getLastValue(channel),
  );

  useEffect(() => {
    return eventBus.subscribe(channel, (data) => {
      setValue(data);
    });
  }, [channel]);

  return value;
}
