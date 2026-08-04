'use client';
import { useEditorStore } from '@/stores/editor-store';
import type { ModuleInstance } from '@/types/config';

export function useModuleConfig<T = Record<string, unknown>>(mod: ModuleInstance, screenId: string) {
  const { updateModule } = useEditorStore();
  const config = mod.config as T;
  const set = (updates: Partial<T>) =>
    updateModule(screenId, mod.id, { config: { ...mod.config, ...updates } });
  return { config, set };
}
