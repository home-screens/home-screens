import type { ModuleInstance, ModuleType } from '@/types/config';
import { getModuleDefinition } from '@/lib/module-registry';

/**
 * Whether a tap anywhere on a module of this type may open its screen.
 * Only built-in types that take no taps of their own: a module that uses a
 * touch (an event, a tick, a photo's controls) keeps the button, and a
 * plugin may use touches the host cannot know about.
 */
export function canOpenWithCard(type: ModuleType): boolean {
  if (type.startsWith('plugin:')) return false;
  const def = getModuleDefinition(type);
  return !!def && !def.takesTaps;
}

/** How this module's open button opens its screen on the wall and in the editor. */
export function openWith(mod: Pick<ModuleInstance, 'type' | 'openWith'>): 'button' | 'card' {
  return mod.openWith === 'card' && canOpenWithCard(mod.type) ? 'card' : 'button';
}
