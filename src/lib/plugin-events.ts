/**
 * Lightweight pub/sub event bus for plugin → host communication.
 *
 * Plugins emit events via `window.__HS_SDK__.emit()`.
 * Host components (ScreenRotator, useSharedDisplayData) subscribe via `on()`.
 *
 * One-way only: plugins can fire events, but the host never pushes events
 * back to plugins. This keeps the security boundary simple.
 */

type PluginEvent =
  | { type: 'navigate'; direction: 'next' | 'prev' | 'screen'; screenIndex?: number }
  | { type: 'refresh' }
  | { type: 'log'; level: 'info' | 'warn' | 'error'; message: string };

import { logger } from '@/lib/logger';

const pluginLog = logger('plugin');
const log = logger('plugin-events');

const VALID_TYPES = new Set(['navigate', 'refresh', 'log']);

type PluginEventHandler = (event: PluginEvent) => void;

const handlers = new Set<PluginEventHandler>();

export const pluginEventBus = {
  /** Emit an event from a plugin. Unknown event types are silently dropped. */
  emit(event: PluginEvent): void {
    if (!event || typeof event.type !== 'string' || !VALID_TYPES.has(event.type)) return;

    // Handle log events immediately — no need for host subscription
    if (event.type === 'log') {
      const { level, message } = event as { type: 'log'; level: string; message: string };
      if (level === 'warn') pluginLog.warn(message);
      else if (level === 'error') pluginLog.error(message);
      else pluginLog.log(message);
    }

    for (const handler of handlers) {
      try { handler(event); } catch (err) { log.debug('handler threw:', err); }
    }
  },

  /** Subscribe to plugin events. Returns an unsubscribe function. */
  on(handler: PluginEventHandler): () => void {
    handlers.add(handler);
    return () => { handlers.delete(handler); };
  },
};
