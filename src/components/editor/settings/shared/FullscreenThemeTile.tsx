'use client';

import FullscreenThemePreview from '@/components/ui/FullscreenThemePreview';
import type { FullscreenTheme } from '@/lib/fullscreen-themes';
import { useTranslate, tOrFallback } from '@/i18n';

interface FullscreenThemeTileProps {
  theme: FullscreenTheme;
  selected: boolean;
  onSelect: () => void;
  /** Set on the per-display Overrides subtab, where an inherited field is read-only until forked. */
  disabled?: boolean;
  /** `row` puts the preview beside the name (settings pages); `stack` puts it
   *  above (the narrow module config panel). */
  layout: 'row' | 'stack';
}

/** The selected/unselected chrome shared by every fullscreen theme tile. */
export function themeTileClass(selected: boolean): string {
  return selected
    ? 'border-hs-accent bg-hs-accent-soft'
    : 'border-hs-border-strong bg-hs-card hover:bg-hs-hover';
}

/**
 * One theme in a fullscreen theme picker: its preview, its name, and its
 * light/dark group. Theme names ("Linen", "Paper", "Charcoal", …) are product
 * names kept verbatim across locales — only the group label below the name
 * is translated, falling back to the raw group identifier so a future group
 * without a registered key still reads sensibly.
 */
export default function FullscreenThemeTile({ theme, selected, onSelect, disabled, layout }: FullscreenThemeTileProps) {
  const t = useTranslate('editor');
  const group = tOrFallback(t, `settings.defaultDisplayPage.themeGroups.${theme.group}`, theme.group);
  const nameClass = selected ? 'text-hs-accent-hover' : 'text-hs-text-body';

  if (layout === 'row') {
    return (
      <button
        type="button"
        disabled={disabled}
        aria-pressed={selected}
        onClick={onSelect}
        className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-left transition-colors ${themeTileClass(selected)} disabled:cursor-not-allowed`}
      >
        <FullscreenThemePreview tokens={theme.tokens} size="sm" />
        <div>
          <div className={`text-xs font-semibold ${nameClass}`}>{theme.name}</div>
          <div className="text-[10px] text-hs-text-faint capitalize">{group}</div>
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={selected}
      onClick={onSelect}
      className={`flex flex-col items-center gap-1.5 rounded-lg border p-2 transition-colors ${themeTileClass(selected)} disabled:cursor-not-allowed`}
    >
      <FullscreenThemePreview tokens={theme.tokens} size="sm" />
      <span className="text-center leading-tight">
        <span className={`block text-[10px] font-semibold ${nameClass}`}>{theme.name}</span>
        <span className="block text-[9px] text-hs-text-faint capitalize">{group}</span>
      </span>
    </button>
  );
}
