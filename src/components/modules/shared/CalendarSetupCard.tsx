'use client';

import { CalendarDays } from 'lucide-react';
import type { CSSProperties } from 'react';
import { settingsPath } from '@/lib/settings-route';
import { EditorSettingsLink } from '../EditorSettingsLink';
import { useModuleSurface } from '../module-surface';

/**
 * The calm card both calendar modules show for a setup problem (no calendars
 * picked, Google sign-in expired) instead of stale events. On the wall the
 * hint says where to go; in the editor the hint is a link to the Calendar
 * settings page. Sized by the caller: the small module in em, the fullscreen
 * calendar in its own scale units.
 */
export function CalendarSetupCard({
  title,
  hint,
  setup,
  titleSize,
  hintSize,
  iconSize,
  color,
  hintColor,
  style,
}: {
  title: string;
  hint: string;
  setup: 'signIn' | 'noSources';
  titleSize: string | number;
  hintSize: string | number;
  iconSize: string | number;
  color?: string;
  hintColor?: string;
  style?: CSSProperties;
}) {
  const surface = useModuleSurface();
  return (
    <div
      data-testid="calendar-setup-card"
      data-setup={setup}
      className="flex flex-col items-center justify-center text-center h-full"
      style={{ gap: '0.5em', padding: '0 1em', color, ...style }}
    >
      <CalendarDays size={iconSize} strokeWidth={1.4} aria-hidden="true" style={{ opacity: 0.7 }} />
      <p style={{ fontSize: titleSize, fontWeight: 600, lineHeight: 1.2 }}>{title}</p>
      {surface === 'editor' ? (
        <EditorSettingsLink
          href={settingsPath({ kind: 'defaults', page: 'calendar' })}
          style={{ fontSize: hintSize, lineHeight: 1.35, color: hintColor, opacity: hintColor ? 1 : 0.7 }}
        >
          {hint}
        </EditorSettingsLink>
      ) : (
        <p style={{ fontSize: hintSize, lineHeight: 1.35, color: hintColor, opacity: hintColor ? 1 : 0.7, maxWidth: '28em' }}>{hint}</p>
      )}
    </div>
  );
}
