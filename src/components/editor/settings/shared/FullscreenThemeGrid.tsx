'use client';

import { FULLSCREEN_THEMES } from '@/lib/fullscreen-themes';
import { useTranslate, tOrFallback } from '@/i18n';

interface FullscreenThemeGridProps {
  value: string;
  onChange: (themeId: string) => void;
  /** Set on the per-display Overrides subtab, where an inherited field is read-only until forked. */
  disabled?: boolean;
  /** Extra classes for the grid container (spacing differs by call site). */
  className?: string;
}

/**
 * The fullscreen theme swatch picker, shared by the Screen defaults page and
 * the per-display Overrides subtab.
 *
 * Theme names ("Linen", "Paper", "Charcoal", …) are product names kept
 * verbatim across locales — only the group label ("light"/"dark") below the
 * name is translated, falling back to the raw group identifier so a future
 * group without a registered key still reads sensibly.
 */
export default function FullscreenThemeGrid({
  value,
  onChange,
  disabled,
  className,
}: FullscreenThemeGridProps) {
  const t = useTranslate('editor');

  return (
    <div className={`grid grid-cols-3 gap-2${className ? ` ${className}` : ''}`}>
      {FULLSCREEN_THEMES.map((theme) => (
        <button
          key={theme.id}
          type="button"
          disabled={disabled}
          onClick={() => onChange(theme.id)}
          className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-left transition-colors ${
            value === theme.id
              ? 'border-hs-accent bg-hs-accent-soft'
              : 'border-hs-border-strong bg-hs-card hover:bg-hs-hover'
          } disabled:cursor-not-allowed`}
        >
          <div
            className="w-7 h-7 rounded-md flex-shrink-0 overflow-hidden border border-hs-border-strong"
            style={{ background: theme.tokens.bg }}
          >
            <div style={{ height: '60%', background: theme.tokens.bg }} />
            <div style={{ height: '40%', background: theme.tokens.border }} />
          </div>
          <div>
            <div
              className={`text-xs font-semibold ${
                value === theme.id ? 'text-hs-accent-hover' : 'text-hs-text-body'
              }`}
            >
              {theme.name}
            </div>
            <div className="text-[10px] text-hs-text-faint capitalize">
              {tOrFallback(t, `settings.defaultDisplayPage.themeGroups.${theme.group}`, theme.group)}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
