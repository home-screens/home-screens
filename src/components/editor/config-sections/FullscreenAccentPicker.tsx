'use client';

import ColorPicker from '@/components/ui/ColorPicker';
import { useTranslate } from '@/i18n';

interface FullscreenAccentPickerProps {
  label: string;
  /** The module's stored `accentColor`; empty means "follow the theme". */
  value: string | undefined;
  /** What the module paints while `value` is empty: the resolved theme accent. */
  themeAccent: string;
  onChange: (accentColor: string) => void;
}

/**
 * The accent picker for a fullscreen module whose accent follows its theme.
 *
 * An empty `accentColor` is a real state ("use whatever the theme says") that
 * a color input cannot express: it only emits hex. So the picker shows the
 * theme accent while empty, offers a reset back to it, and stores a pick that
 * equals the theme accent as empty again — the same paint either way, and the
 * module keeps following the theme when the theme changes later.
 */
export default function FullscreenAccentPicker({ label, value, themeAccent, onChange }: FullscreenAccentPickerProps) {
  const t = useTranslate('editor');
  return (
    <ColorPicker
      label={label}
      value={value || themeAccent}
      defaultValue={themeAccent}
      resetLabel={t('common.resetToDefault')}
      onChange={(v) => onChange(v.toLowerCase() === themeAccent.toLowerCase() ? '' : v)}
    />
  );
}
