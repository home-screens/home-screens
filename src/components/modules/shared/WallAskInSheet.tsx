'use client';

import type { CSSProperties } from 'react';
import type { FullscreenThemeTokens } from '@/lib/fullscreen-themes';
import { wallPressProps } from './wallPress';

export interface WallAskChoice {
  id: string;
  label: string;
  /** A small second line saying exactly what it touches ("Saturday, November 21. The other Saturdays stay."). */
  detail?: string;
  /** `primary` is the safe, highlighted answer; `danger` and `dangerFill` remove, filled for the one that removes the most. */
  tone: 'primary' | 'plain' | 'danger' | 'dangerFill';
}

/** The wall's red: the theme's own would be a guess, and every theme reads this one. */
const DANGER_LIGHT = '#b91c1c';
const DANGER_DARK = '#f87171';

/**
 * A question asked inside the sheet it is about, replacing that sheet's
 * buttons, so there is no second overlay to dismiss: "Remove this event?",
 * "Just this day or every time?". Big touch targets sized like the event
 * detail's own (viewport-relative, never below 44 px). Shared by every wall
 * sheet that has to ask before it changes something.
 */
export function WallAskInSheet({ title, body, choices, cancelLabel, onPick, onCancel, theme, accentColor, busy = false, testId }: {
  title: string;
  body?: string;
  choices: WallAskChoice[];
  cancelLabel: string;
  onPick: (id: string) => void;
  onCancel: () => void;
  theme: FullscreenThemeTokens;
  /** The highlighted answer's colour. */
  accentColor: string;
  /** A write is under way: the answers wait. */
  busy?: boolean;
  testId?: string;
}) {
  const danger = theme.isDark ? DANGER_DARK : DANGER_LIGHT;
  const removes = choices.some((c) => c.tone === 'danger' || c.tone === 'dangerFill');
  const button = (tone: WallAskChoice['tone']): CSSProperties => {
    const base: CSSProperties = {
      display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: 4,
      width: '100%', minHeight: 'max(44px, clamp(56px, 11vmin, 120px))', padding: 'clamp(10px, 1.7vmin, 18px) clamp(16px, 3vmin, 32px)',
      borderRadius: 22, marginTop: 'clamp(10px, 1.5vmin, 16px)', fontFamily: 'inherit', textAlign: 'left',
      fontSize: 'clamp(17px, 3vmin, 32px)', fontWeight: 700, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1,
      border: `2px solid ${theme.border}`, background: theme.surfaceAlt, color: theme.text,
    };
    if (tone === 'primary') return { ...base, background: accentColor, borderColor: 'transparent', color: '#fff' };
    if (tone === 'danger') return { ...base, background: 'transparent', color: danger, borderColor: `color-mix(in srgb, ${danger} 40%, transparent)` };
    if (tone === 'dangerFill') return { ...base, background: danger, borderColor: 'transparent', color: '#fff' };
    return base;
  };

  return (
    <div
      role="group"
      aria-label={title}
      data-testid={testId}
      style={{
        marginTop: 'clamp(20px, 3.2vmin, 34px)',
        borderRadius: 22,
        padding: 'clamp(16px, 2.6vmin, 28px) clamp(16px, 2.8vmin, 30px)',
        background: removes ? `color-mix(in srgb, ${danger} 8%, ${theme.surface})` : `color-mix(in srgb, ${theme.text} 4%, ${theme.surface})`,
        border: `2px solid ${removes ? `color-mix(in srgb, ${danger} 28%, transparent)` : theme.borderSubtle}`,
      }}
    >
      <div style={{ fontSize: 'clamp(19px, 3.2vmin, 34px)', fontWeight: 700, color: theme.text, marginBottom: body ? 8 : 0 }}>{title}</div>
      {body && <div style={{ fontSize: 'clamp(15px, 2.4vmin, 26px)', color: theme.textSecondary, lineHeight: 1.4 }}>{body}</div>}
      {choices.map((choice) => (
        <button
          key={choice.id}
          type="button"
          {...wallPressProps}
          data-choice={choice.id}
          disabled={busy}
          onClick={() => onPick(choice.id)}
          style={button(choice.tone)}
        >
          {choice.label}
          {choice.detail && <span style={{ fontSize: 'clamp(13px, 2.2vmin, 24px)', fontWeight: 500, opacity: 0.85 }}>{choice.detail}</span>}
        </button>
      ))}
      <button
        type="button"
        {...wallPressProps}
        data-choice="cancel"
        onClick={onCancel}
        style={{ ...button('plain'), alignItems: 'center', fontWeight: 600 }}
      >
        {cancelLabel}
      </button>
    </div>
  );
}
