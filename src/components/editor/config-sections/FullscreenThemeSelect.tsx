'use client';

import LabeledField from '@/components/ui/LabeledField';
import FullscreenThemeTile, { themeTileClass } from '@/components/editor/settings/shared/FullscreenThemeTile';
import { FULLSCREEN_THEMES } from '@/lib/fullscreen-themes';
import { useTranslate } from '@/i18n';

interface FullscreenThemeSelectProps {
  /** Current theme id (undefined = inherit the display default). */
  value: string | undefined;
  /** Called with the new theme id, or undefined when "default" is picked. */
  onChange: (theme: string | undefined) => void;
  /** i18n key (editor namespace) for the "default" option's label — the one
   *  piece of copy that differs between the fullscreen modules. */
  defaultOptionKey: string;
}

/**
 * The theme picker shared by the fullscreen config sections: every
 * `FULLSCREEN_THEMES` entry plus an "inherit the display default" tile.
 *
 * This was a plain `<select>` of theme names. That was workable at six
 * themes and stops being workable past that — the names alone say nothing
 * about what a theme looks like, and several of them differ mainly in how
 * events are painted, which a name cannot convey at all.
 */
export default function FullscreenThemeSelect({
  value,
  onChange,
  defaultOptionKey,
}: FullscreenThemeSelectProps) {
  const t = useTranslate('editor');
  return (
    // `div`, not the default `label`: a label wrapping thirteen buttons
    // forwards a click on the caption or the gap between tiles to the first
    // button, silently resetting the theme to the display default.
    <LabeledField label={t('common.theme')} as="div">
      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          aria-pressed={value === undefined}
          onClick={() => onChange(undefined)}
          className={`flex flex-col items-center gap-1.5 rounded-lg border p-2 transition-colors ${themeTileClass(value === undefined)}`}
        >
          <div className="w-11 h-[30px] flex-shrink-0 rounded-[5px] border border-dashed border-hs-border-strong" />
          <span
            className={`text-[10px] font-semibold text-center leading-tight ${
              value === undefined ? 'text-hs-accent-hover' : 'text-hs-text-body'
            }`}
          >
            {t(defaultOptionKey)}
          </span>
        </button>

        {FULLSCREEN_THEMES.map((theme) => (
          <FullscreenThemeTile
            key={theme.id}
            theme={theme}
            layout="stack"
            selected={value === theme.id}
            onSelect={() => onChange(theme.id)}
          />
        ))}
      </div>
    </LabeledField>
  );
}
