'use client';

import LabeledField from '@/components/ui/LabeledField';
import { INPUT_CLASS } from '@/components/ui/input-classes';
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
 * The theme-override select shared by the fullscreen config sections. Every
 * fullscreen module offers the same list of `FULLSCREEN_THEMES` plus a
 * "default" option; only the default option's label wording differs.
 */
export default function FullscreenThemeSelect({
  value,
  onChange,
  defaultOptionKey,
}: FullscreenThemeSelectProps) {
  const t = useTranslate('editor');
  return (
    <LabeledField label={t('common.theme')}>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || undefined)}
        className={INPUT_CLASS}
      >
        <option value="">{t(defaultOptionKey)}</option>
        {FULLSCREEN_THEMES.map((theme) => (
          <option key={theme.id} value={theme.id}>{theme.name} ({theme.group})</option>
        ))}
      </select>
    </LabeledField>
  );
}
