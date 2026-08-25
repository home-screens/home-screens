'use client';

import { useEditorStore } from '@/stores/editor-store';
import { getThemeTokens, migrateFromDarkMode } from '@/lib/fullscreen-themes';
import type { FullscreenThemeTokens } from '@/lib/fullscreen-themes';

/**
 * The theme tokens a fullscreen module is actually rendering with, resolved
 * in the editor exactly as the canvas preview resolves them: the module's own
 * `theme`, else the display-wide `fullscreenTheme` default, else the legacy
 * `darkMode` mapping. Config sections use this so a swatch that depends on
 * the theme (the accent picker) shows the color the preview is painting
 * rather than the Linen fallback for an inherited theme.
 */
export function useFullscreenThemeTokens(
  theme: string | undefined,
  darkMode?: boolean,
): FullscreenThemeTokens {
  const fullscreenTheme = useEditorStore((s) => s.config?.settings?.fullscreenTheme);
  return getThemeTokens(theme ?? fullscreenTheme ?? migrateFromDarkMode(darkMode));
}
