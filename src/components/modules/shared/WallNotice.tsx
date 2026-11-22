'use client';

import type { ReactNode } from 'react';
import { CircleAlert, Info, TriangleAlert } from 'lucide-react';

export type WallNoticeTone = 'warning' | 'error' | 'info';

/** Each tone's own colour, mixed toward the theme so it reads on a light sheet and a dark one alike. */
const TONE_COLOR: Record<Exclude<WallNoticeTone, 'info'>, string> = { warning: '#f59e0b', error: '#ef4444' };

/**
 * One line inside a wall sheet saying what happened and what to do: a
 * warning ("Someone changed this event"), an error ("Couldn't add that. The
 * hub isn't answering") or quiet information ("This change is for Saturday
 * only"). Colours from the `--wt-*` variables (`wallTypingVars`).
 */
export function WallNotice({ tone, P, icon, testId = 'wall-notice', children }: {
  tone: WallNoticeTone;
  P: (n: number) => number;
  /** In place of the tone's own icon. */
  icon?: ReactNode;
  testId?: string;
  children: ReactNode;
}) {
  const hue = tone === 'info' ? null : TONE_COLOR[tone];
  const Icon = tone === 'warning' ? TriangleAlert : tone === 'error' ? CircleAlert : Info;
  return (
    <div
      data-testid={testId}
      data-tone={tone}
      role={tone === 'info' ? 'status' : 'alert'}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: P(18), padding: `${P(18)}px ${P(24)}px`, borderRadius: P(18),
        fontSize: P(26), lineHeight: 1.4,
        background: hue ? `color-mix(in srgb, ${hue} 16%, var(--wt-surface))` : 'color-mix(in srgb, var(--wt-text) 6%, var(--wt-surface))',
        color: hue ? `color-mix(in srgb, ${hue} 55%, var(--wt-text))` : 'var(--wt-text-2)',
        border: `1px solid ${hue ? `color-mix(in srgb, ${hue} 30%, transparent)` : 'color-mix(in srgb, var(--wt-text) 10%, transparent)'}`,
      }}
    >
      <span style={{ flexShrink: 0, display: 'flex', marginTop: P(2) }}>
        {icon ?? <Icon size={P(34)} strokeWidth={2.2} aria-hidden="true" />}
      </span>
      <span style={{ minWidth: 0 }}>{children}</span>
    </div>
  );
}
