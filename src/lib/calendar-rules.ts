import type { CSSProperties } from 'react';
import { isSameDay } from 'date-fns';
import type {
  CalendarDayMatch,
  CalendarDayRule,
  CalendarEvent,
  CalendarEventMatch,
  CalendarEventRule,
} from '@/types/config';
import { eventKindGlyph, isEventUpcoming } from './calendar-utils';
import { parseHexToRgb } from './hex-color';

/**
 * Calendar rules engines: "event looks" and "day looks" (roadmap items
 * 23-25). Pure functions over config + events so both calendar modules and
 * their unit tests share one authority.
 *
 * Semantics (documented on the types too):
 * - every set field in a match must hold; an empty match matches everything
 * - rules run top to bottom; the first rule that sets a property wins for
 *   that property, so rules compose per field and list order is priority
 * - `hide` from any matching event rule hides the event
 * - day badges stack: every matching day rule with a badge adds a chip
 */

export interface RuleContext {
  /** Current instant on the display clock; only read by `past` matches. */
  now: Date;
  timezone?: string;
}

export interface DayRuleContext extends RuleContext {
  /** Start of today on the display clock. */
  today: Date;
}

export interface DayBadge {
  icon?: string;
  text?: string;
  color?: string;
}

export interface DayDecor {
  background?: string;
  opacity?: number;
  borderColor?: string;
  badges: DayBadge[];
}

/** Shared "no day rule applied" value. Exported so callers can fill a
 *  per-day array without allocating, and compare against it by identity. */
export const NO_DECOR: DayDecor = { badges: [] };

// ─── Event matching ───

function textMatches(
  text: string | undefined,
  mode: CalendarEventMatch['textMatch'],
  title: string,
): boolean {
  const needle = (text ?? '').trim();
  if (!needle) return true;
  const haystack = title.toLowerCase();
  const lower = needle.toLowerCase();
  if (mode === 'exact') return haystack === lower;
  if (mode === 'regex') {
    // A half-typed or invalid pattern must never throw mid-render, and
    // "matches nothing" is the safe reading while the user is still typing.
    try {
      return new RegExp(needle, 'i').test(title);
    } catch {
      return false;
    }
  }
  return haystack.includes(lower);
}

export function matchesEvent(match: CalendarEventMatch | undefined, ev: CalendarEvent, ctx: RuleContext): boolean {
  if (!match) return true;
  if (!textMatches(match.text, match.textMatch, ev.title)) return false;
  if (match.sourceIds && match.sourceIds.length > 0) {
    if (!ev.sourceId || !match.sourceIds.includes(ev.sourceId)) return false;
  }
  const location = (match.location ?? '').trim().toLowerCase();
  if (location && !(ev.location ?? '').toLowerCase().includes(location)) return false;
  if (match.allDay != null && ev.allDay !== match.allDay) return false;
  if (match.past != null) {
    const isPast = !isEventUpcoming(ev, ctx.now, ctx.timezone);
    if (isPast !== match.past) return false;
  }
  if (match.kind != null && (ev.kind ?? 'event') !== match.kind) return false;
  return true;
}

/** True when any rule's match reads the clock, so callers know whether a
 *  clock tick can change the outcome (and otherwise skip re-running). */
export function rulesNeedNow(eventRules?: CalendarEventRule[], dayRules?: CalendarDayRule[]): boolean {
  if (eventRules?.some((r) => r.match?.past != null)) return true;
  return dayRules?.some((r) => r.match?.withEvents === 'matching' && r.match.eventMatch?.past != null) === true;
}

function clampOpacity(value: number | undefined): number | undefined {
  if (value == null || !Number.isFinite(value)) return undefined;
  return Math.min(1, Math.max(0.05, value));
}

/**
 * Apply event rules to a feed. Hidden events are dropped; the rest are
 * shallow-copied only when a rule actually changes them, so an event list
 * with no matching rules keeps its object identities (memoized renderers
 * stay warm).
 */
export function applyEventRules(
  events: CalendarEvent[],
  rules: CalendarEventRule[] | undefined,
  ctx: RuleContext,
): CalendarEvent[] {
  if (!rules || rules.length === 0) return events;
  const out: CalendarEvent[] = [];
  for (const ev of events) {
    let hidden = false;
    let color: string | undefined;
    let opacity: number | undefined;
    let icon: string | undefined;
    let title: string | undefined;
    for (const rule of rules) {
      if (!matchesEvent(rule.match, ev, ctx)) continue;
      if (rule.hide) { hidden = true; break; }
      if (color == null && rule.color) color = rule.color;
      if (opacity == null && rule.opacity != null) opacity = clampOpacity(rule.opacity);
      if (icon == null && rule.icon?.trim()) icon = rule.icon.trim();
      if (title == null && rule.title?.trim()) title = rule.title.trim();
    }
    if (hidden) continue;
    if (color == null && opacity == null && icon == null && title == null) {
      out.push(ev);
      continue;
    }
    out.push({
      ...ev,
      ...(color != null ? { calendarColor: color } : {}),
      ...(title != null ? { title } : {}),
      ...(icon != null ? { icon } : {}),
      ...(opacity != null ? { opacity } : {}),
    });
  }
  return out;
}

// ─── Day matching ───

export function matchesDay(
  match: CalendarDayMatch | undefined,
  day: Date,
  dayEvents: CalendarEvent[],
  ctx: DayRuleContext,
): boolean {
  if (!match) return true;
  if (match.when) {
    const isToday = isSameDay(day, ctx.today);
    if (match.when === 'today' && !isToday) return false;
    if (match.when === 'past' && (isToday || day >= ctx.today)) return false;
    if (match.when === 'future' && (isToday || day <= ctx.today)) return false;
  }
  if (match.daysOfWeek && match.daysOfWeek.length > 0 && !match.daysOfWeek.includes(day.getDay())) {
    return false;
  }
  if (match.withEvents === 'any' && dayEvents.length === 0) return false;
  if (match.withEvents === 'none' && dayEvents.length > 0) return false;
  if (match.withEvents === 'matching' && !dayEvents.some((ev) => matchesEvent(match.eventMatch, ev, ctx))) {
    return false;
  }
  return true;
}

/**
 * Tint derived from the colors of the events on a day: one color = a flat
 * wash, several = a soft top-to-bottom gradient through each distinct color.
 * `alpha` is the wash strength (callers pick per theme). Returns undefined
 * for an empty day so the cell keeps its normal background.
 */
export function autoDayTint(dayEvents: CalendarEvent[], alpha: number): string | undefined {
  const colors: string[] = [];
  for (const ev of dayEvents) {
    const c = ev.calendarColor;
    if (c && !colors.includes(c)) colors.push(c);
  }
  if (colors.length === 0) return undefined;
  const washes = colors.map((c) => {
    const rgb = parseHexToRgb(c);
    return rgb
      ? `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`
      : `color-mix(in srgb, ${c} ${Math.round(alpha * 100)}%, transparent)`;
  });
  if (washes.length === 1) return washes[0];
  return `linear-gradient(180deg, ${washes.join(', ')})`;
}

/**
 * Resolve the look and badges for one day cell. Style properties are
 * first-wins down the list; badges come from every matching rule that
 * declares one (icon or text). Returns a shared empty decor for the common
 * no-rules case so cells can compare against it cheaply.
 */
export function resolveDayDecor(
  day: Date,
  dayEvents: CalendarEvent[],
  rules: CalendarDayRule[] | undefined,
  ctx: DayRuleContext,
  opts: { autoTintAlpha?: number } = {},
): DayDecor {
  if (!rules || rules.length === 0) return NO_DECOR;
  let background: string | undefined;
  let opacity: number | undefined;
  let borderColor: string | undefined;
  const badges: DayBadge[] = [];
  for (const rule of rules) {
    if (!matchesDay(rule.match, day, dayEvents, ctx)) continue;
    if (background == null && rule.background) {
      background = rule.background === 'auto'
        ? autoDayTint(dayEvents, opts.autoTintAlpha ?? 0.18)
        : rule.background;
    }
    if (opacity == null && rule.opacity != null) opacity = clampOpacity(rule.opacity);
    if (borderColor == null && rule.borderColor) borderColor = rule.borderColor;
    const icon = rule.badgeIcon?.trim();
    const text = rule.badgeText?.trim();
    if (icon || text) badges.push({ icon: icon || undefined, text: text || undefined, color: rule.badgeColor || undefined });
  }
  if (background == null && opacity == null && borderColor == null && badges.length === 0) return NO_DECOR;
  return { background, opacity, borderColor, badges };
}

/** Glyph for an event row / pill: a rule icon beats the built-in kind glyph. */
export function eventGlyph(ev: Pick<CalendarEvent, 'icon' | 'kind'>): string | null {
  return ev.icon || eventKindGlyph(ev.kind);
}

/** A view's own fade (dim past, etc.) multiplied by any rule fade. */
export function eventOpacity(ev: Pick<CalendarEvent, 'opacity'>, base: number | string): number | string {
  if (ev.opacity == null) return base;
  if (typeof base === 'number') return base * ev.opacity;
  // CSS var bases (fullscreen 'var(--cal-past-opacity)') compose via calc.
  return `calc(${base} * ${ev.opacity})`;
}

/**
 * Day-rule look merged over a cell's own inline style: background
 * replaces (both shorthand and the longhand color/image), opacity
 * multiplies, the border joins any existing box shadow as an inset ring.
 * Returns `base` untouched when the decor sets nothing (identity stays
 * cheap to compare).
 */
export function mergeCellDecor(base: CSSProperties, decor: DayDecor): CSSProperties {
  if (decor.background == null && decor.opacity == null && decor.borderColor == null) return base;
  const out: CSSProperties = { ...base };
  if (decor.background) {
    delete out.backgroundColor;
    delete out.backgroundImage;
    out.background = decor.background;
  }
  if (decor.opacity != null) {
    const current = typeof base.opacity === 'number' ? base.opacity : 1;
    // A CSS-var base (fullscreen dimPastEvents) composes via calc.
    out.opacity = typeof base.opacity === 'string' ? `calc(${base.opacity} * ${decor.opacity})` : current * decor.opacity;
  }
  if (decor.borderColor) {
    const ring = `inset 0 0 0 1px ${decor.borderColor}`;
    out.boxShadow = base.boxShadow ? `${base.boxShadow}, ${ring}` : ring;
  }
  return out;
}
