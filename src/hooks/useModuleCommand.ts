'use client';

import { useEffect, useRef } from 'react';

/**
 * Hub -> module commands. The display's command poll receives a
 * `module-command` (`{ module: 'news', action: 'next' }`) and re-broadcasts
 * it as a DOM event; any mounted module of that type reacts. Modules never
 * talk to the hub for this, so the same event also works from touch
 * controls on the display itself.
 */

export const MODULE_COMMAND_EVENT = 'hs:module-command';

export interface ModuleCommand {
  module: string;
  action: string;
  /** Optional free-form argument (a story index, a screen name, ...). */
  value?: string | number;
}

export function dispatchModuleCommand(command: ModuleCommand): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<ModuleCommand>(MODULE_COMMAND_EVENT, { detail: command }));
}

/** Subscribe to commands addressed to `module`; `handler` may change freely. */
export function useModuleCommand(module: string, handler: (action: string, value?: string | number) => void): void {
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<ModuleCommand>).detail;
      if (!detail || detail.module !== module) return;
      handlerRef.current(detail.action, detail.value);
    };
    window.addEventListener(MODULE_COMMAND_EVENT, listener);
    return () => window.removeEventListener(MODULE_COMMAND_EVENT, listener);
  }, [module]);
}
