'use client';

import { FULLSCREEN_THEMES } from '@/lib/fullscreen-themes';
import FullscreenThemeTile from './FullscreenThemeTile';

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
 */
export default function FullscreenThemeGrid({
  value,
  onChange,
  disabled,
  className,
}: FullscreenThemeGridProps) {
  return (
    <div className={`grid grid-cols-3 gap-2${className ? ` ${className}` : ''}`}>
      {FULLSCREEN_THEMES.map((theme) => (
        <FullscreenThemeTile
          key={theme.id}
          theme={theme}
          layout="row"
          selected={value === theme.id}
          disabled={disabled}
          onSelect={() => onChange(theme.id)}
        />
      ))}
    </div>
  );
}
