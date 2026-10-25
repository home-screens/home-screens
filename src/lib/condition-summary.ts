/**
 * A condition list in a few words, for a rule card's header: "Temperature
 * right now above 24", "Front door is open", "9:00 PM to 6:00 AM", "any of
 * 3". The header has one line, so this reads the shape of each root
 * condition and joins them; the full detail lives in the open card. Every
 * leaf names its key: a temperature look and a rain-chance look that both
 * read "above 50" were telling the two apart by nothing.
 */

import type { TimeFormat, VisibilityCondition } from '@/types/config';
import type { TranslateFn } from '@/i18n/types';
import { formatScheduleDays, formatScheduleTime } from '@/lib/schedule-summary';
import { formatNumber } from '@/i18n/formatters';

export interface ConditionSummaryContext {
  t: TranslateFn;
  formattingLocale: string;
  timeFormat: TimeFormat | undefined;
  /** Friendly name for a key; falls back to the key's last segment. */
  labelFor?: (key: string) => string | undefined;
}

const KEY = 'conditionSummary';

/** The readable tail of a bus key: `plugin:ha:sensor.bedroom` reads `sensor.bedroom`. */
export function keyTail(key: string): string {
  const i = key.lastIndexOf(':');
  return i >= 0 ? key.slice(i + 1) : key;
}

function valueText(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value.join(', ');
  return value ?? '';
}

/** `true` or `false` as a bus value, however the condition spells the comparison; null for anything else. */
function truthOf(c: Extract<VisibilityCondition, { kind: 'state' }>): boolean | null {
  const value = c.equals ?? c.notEquals;
  if (value !== 'true' && value !== 'false') return null;
  return (value === 'true') === (c.notEquals === undefined);
}

function describeOne(c: VisibilityCondition, ctx: ConditionSummaryContext): string {
  const { t, formattingLocale } = ctx;
  const keyLabel = (sourceKey: string) => (sourceKey ? (ctx.labelFor?.(sourceKey) ?? keyTail(sourceKey)) : t(`${KEY}.noKey`));
  switch (c.kind) {
    case 'numeric': {
      const key = keyLabel(c.sourceKey);
      const n = (v: number) => formatNumber(v, { locale: formattingLocale, maximumFractionDigits: 3 });
      if (c.above !== undefined && c.below !== undefined) {
        return t(`${KEY}.between`, { key, a: n(c.above), b: n(c.below) });
      }
      if (c.above !== undefined) return t(`${KEY}.above`, { key, n: n(c.above) });
      if (c.below !== undefined) return t(`${KEY}.below`, { key, n: n(c.below) });
      return t(`${KEY}.anyNumber`, { key });
    }
    case 'state': {
      const label = keyLabel(c.sourceKey);
      const value = valueText(c.equals ?? c.notEquals);
      if (value === '') return label;
      // A yes-or-no key's name is already the sentence ("A weather warning is
      // in force"), so "… is true" only repeats it and "… is false" denies
      // it clumsily. The name alone means yes; a short "no" after it means no.
      const truth = truthOf(c);
      if (truth === true) return label;
      if (truth === false) return t(`${KEY}.isNo`, { key: label });
      return t(c.notEquals !== undefined ? `${KEY}.isNot` : `${KEY}.is`, { key: label, value });
    }
    case 'time': {
      const window = {
        daysOfWeek: c.daysOfWeek,
        startTime: c.startTime,
        endTime: c.endTime,
        endDayOffset: c.endDayOffset,
      };
      const time = formatScheduleTime(window, t, formattingLocale, ctx.timeFormat);
      const everyDay = !c.daysOfWeek || c.daysOfWeek.length === 0 || c.daysOfWeek.length === 7;
      if (everyDay) return time;
      return t('scheduleEditor.summary.short', { days: formatScheduleDays(window, t, formattingLocale), time });
    }
    case 'and':
      return t(`${KEY}.allOf`, { n: c.conditions.length });
    case 'or':
      return t(`${KEY}.anyOf`, { n: c.conditions.length });
    case 'not':
      return t(`${KEY}.noneOf`, { n: c.conditions.length });
  }
}

/**
 * The whole list in one line. An empty list is "always"; several root
 * conditions are joined with a middle dot, which the header truncates.
 */
export function describeConditions(conditions: VisibilityCondition[], ctx: ConditionSummaryContext): string {
  if (conditions.length === 0) return ctx.t(`${KEY}.always`);
  return conditions.map((c) => describeOne(c, ctx)).join(' · ');
}
