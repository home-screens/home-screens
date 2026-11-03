'use client';

import { createContext, useContext, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import { useTranslate } from '@/i18n';
import { ink } from '@/lib/constants';
import { lookAheadHeading, lookAheadHomeKey, lookAheadLimit } from '@/lib/look-ahead';
import type { LookAhead } from './useLookAhead';
import { wallPressProps } from './wallPress';

/**
 * How the arrows are drawn: `ink` on a small module, in the module's own
 * text colour over whatever is behind it; `theme` on the full-screen
 * calendar, in its theme (`--cal-*`); `meal` on the full-screen meal
 * planner, in its theme (`--fmp-*`).
 */
export type LookAheadTone = 'ink' | 'theme' | 'meal';

const TONES: Record<LookAheadTone, { bg: string; border: string; color: string }> = {
  ink: { bg: ink(0.08), border: ink(0.16), color: ink(0.82) },
  theme: {
    bg: 'color-mix(in srgb, var(--cal-text-primary) 5%, transparent)',
    border: 'color-mix(in srgb, var(--cal-text-primary) 14%, transparent)',
    color: 'var(--cal-text-primary)',
  },
  meal: {
    bg: 'color-mix(in srgb, var(--fmp-text) 5%, transparent)',
    border: 'color-mix(in srgb, var(--fmp-text) 14%, transparent)',
    color: 'var(--fmp-text)',
  },
};

/** Finger-sized whatever the text size: never under 44 px. */
export const LOOK_AHEAD_BUTTON = 'max(44px, 2.75em)';

function Chevron({ back }: { back: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="50%" height="50%" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={back ? 'm15 18-6-6 6-6' : 'm9 18 6-6-6-6'} />
    </svg>
  );
}

/** The way-back button's icon: a turn back, so the button reads as going somewhere. */
function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" width="1.05em" height="1.05em" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5 5.5 5.5 0 0 1-5.5 5.5H11" />
    </svg>
  );
}

/** A tap on an arrow is not a tap on the calendar under it (an event, a day). */
function only(fn: () => void) {
  return (e: MouseEvent) => {
    e.stopPropagation();
    fn();
  };
}

interface ButtonLook {
  look: LookAhead;
  tone?: LookAheadTone;
  /** The arrows' width and height. */
  size?: string;
}

/**
 * One arrow: ‹ (`back`) or ›. At the end of the reach it greys but still
 * answers a tap, with how far the wall goes (`look.limit`).
 */
export function LookAheadArrow({ look, back, tone = 'ink', size = LOOK_AHEAD_BUTTON }: ButtonLook & { back: boolean }) {
  const t = useTranslate('modules');
  const enabled = back ? look.canBack : look.canForward;
  const colors = TONES[tone];
  return (
    <button
      type="button"
      {...wallPressProps}
      data-testid={back ? 'look-ahead-back' : 'look-ahead-forward'}
      aria-label={t(back ? 'lookAhead.earlier' : 'lookAhead.later')}
      aria-disabled={!enabled}
      onClick={only(back ? look.back : look.forward)}
      style={{
        width: size, height: size, borderRadius: '50%', flexShrink: 0, padding: 0,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: colors.bg, border: `1px solid ${colors.border}`, color: colors.color,
        font: 'inherit', cursor: 'pointer', opacity: enabled ? 1 : 0.3, touchAction: 'manipulation',
      }}
    >
      <Chevron back={back} />
    </button>
  );
}

/** The way back while away ("Back to this week", this month, today), in the accent. */
export function LookAheadHomeButton({ look, accent, onAccent = '#fff', size = LOOK_AHEAD_BUTTON }: ButtonLook & { accent: string; onAccent?: string }) {
  const t = useTranslate('modules');
  if (!look.away || !look.step) return null;
  return (
    <button
      type="button"
      {...wallPressProps}
      data-testid="look-ahead-home"
      onClick={only(look.home)}
      style={{
        height: size, padding: '0 1em 0 0.85em', borderRadius: 999, flexShrink: 0, border: 0,
        display: 'inline-flex', alignItems: 'center', gap: '0.4em',
        background: accent, color: onAccent, font: 'inherit', fontWeight: 700, whiteSpace: 'nowrap', cursor: 'pointer',
        boxShadow: `0 0.25em 0.9em color-mix(in srgb, ${accent} 40%, transparent)`, touchAction: 'manipulation',
      }}
    >
      <BackIcon />
      {t(`lookAhead.${lookAheadHomeKey(look.step)}`)}
    </button>
  );
}

/**
 * The way back while away, then ‹ and ›. The way back comes before the
 * arrows, never between them, so the arrows stay where the finger left
 * them: a second tap in the same place steps again.
 */
export function LookAheadButtons({ look, accent, onAccent, tone, size }: ButtonLook & { accent: string; onAccent?: string }) {
  if (!look.on || !look.step) return null;
  return (
    <>
      <LookAheadHomeButton look={look} accent={accent} onAccent={onAccent} size={size} />
      <LookAheadArrow look={look} back tone={tone} size={size} />
      <LookAheadArrow look={look} back={false} tone={tone} size={size} />
    </>
  );
}

/** What the heading calls the period shown: This week, Next week, Today, In 3 days. */
export function useLookAheadWords(look: LookAhead): string {
  const t = useTranslate('modules');
  if (!look.step) return '';
  const words = lookAheadHeading(look.offset, look.step);
  return t(`lookAhead.${words.key}`, words.values);
}

/** After a tap past the end: "The wall goes up to 8 weeks ahead"; otherwise null. */
export function useLookAheadLimitWords(look: LookAhead): string | null {
  const t = useTranslate('modules');
  if (!look.step || !look.limit) return null;
  const words = lookAheadLimit(look.step, look.limit);
  return t(`lookAhead.${words.key}`, words.values);
}

/** The words while stepped: in the accent, so another week looks different from across the room. */
export function lookAheadWordsStyle(look: LookAhead, accent: string): CSSProperties {
  return look.away ? { color: accent } : {};
}

/**
 * The heading row a small module without one gets on a touch wall: the
 * period in words and its dates, then the way back and the arrows. A view
 * showing several weeks at a time (`datesOnly`) heads with its dates alone:
 * "Next week" would name only the first of them. When the dates do not fit
 * beside the way back, `shortDates` ("Nov 16 – 22") takes their place.
 */
export function LookAheadBar({ look, dates, shortDates, accent, datesOnly = false, style }: {
  look: LookAhead;
  dates: string;
  shortDates?: string;
  accent: string;
  datesOnly?: boolean;
  style?: CSSProperties;
}) {
  const words = useLookAheadWords(look);
  const limitWords = useLookAheadLimitWords(look);
  const datesRef = useRef<HTMLSpanElement>(null);
  // The long dates first; the short ones only for the dates that did not fit.
  const [shortFor, setShortFor] = useState<string | null>(null);
  const useShort = !!shortDates && shortFor === dates;
  const tight = look.away;
  useLayoutEffect(() => {
    const el = datesRef.current;
    if (!el || !shortDates || useShort || limitWords) return;
    if (el.scrollWidth > el.clientWidth + 1) setShortFor(dates);
  }, [dates, shortDates, useShort, limitWords, tight]);
  if (!look.on) return null;
  const strong: CSSProperties = { fontWeight: 700, fontSize: '1.1em', ...lookAheadWordsStyle(look, accent) };
  return (
    <div
      data-testid="look-ahead-bar"
      data-offset={look.offset}
      style={{ display: 'flex', alignItems: 'center', gap: '0.5em', height: LOOK_AHEAD_BUTTON, marginBottom: '0.5em', flexShrink: 0, ...style }}
    >
      <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', gap: '0.6em', whiteSpace: 'nowrap', overflow: 'hidden' }}>
        {!datesOnly && <span data-testid="look-ahead-words" style={{ ...strong, flexShrink: 0 }}>{words}</span>}
        {limitWords ? (
          <span data-testid="look-ahead-limit" role="status" style={{ color: ink(0.75), minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{limitWords}</span>
        ) : (
          <span
            ref={datesRef}
            data-testid="look-ahead-dates"
            style={datesOnly
              ? { ...strong, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }
              : { color: ink(0.55), minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}
          >
            {useShort ? shortDates : dates}
          </span>
        )}
      </div>
      <LookAheadButtons look={look} accent={accent} />
    </div>
  );
}

/**
 * A title a view already draws ("November 2026"), between ‹ at the left and
 * the way back and › at the right. Each arrow keeps its end of the row, and
 * the title stays centred while there is room on both sides.
 */
export function LookAheadTitle({ look, accent, children, style }: { look: LookAhead; accent: string; children: ReactNode; style?: CSSProperties }) {
  const limitWords = useLookAheadLimitWords(look);
  if (!look.on) return <>{children}</>;
  return (
    <div
      data-testid="look-ahead-bar"
      data-offset={look.offset}
      style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', columnGap: '0.5em', height: LOOK_AHEAD_BUTTON, flexShrink: 0, ...style }}
    >
      <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
        <LookAheadArrow look={look} back />
      </div>
      <div style={{ minWidth: 0, textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {limitWords ? <span data-testid="look-ahead-limit" role="status" style={{ fontSize: '0.85em' }}>{limitWords}</span> : children}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '0.5em' }}>
        <LookAheadHomeButton look={look} accent={accent} />
        <LookAheadArrow look={look} back={false} />
      </div>
    </div>
  );
}

/** The arrows a module hands its view (the small Month draws them in its title). */
export const LookAheadContext = createContext<{ look: LookAhead; accent: string } | null>(null);

export function useLookAheadContext() {
  return useContext(LookAheadContext);
}
