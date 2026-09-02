import { Clock, Eye, EyeOff, PowerOff, type LucideIcon } from 'lucide-react';
import { evaluateVisibility, isModuleEnabled, isModuleVisible } from '@/lib/schedule';
import { describeSchedule } from '@/lib/schedule-summary';
import type { SharedStateEntry } from '@/lib/shared-state-types';
import type { ModuleInstance, TimeFormat } from '@/types/config';
import type { TranslateFn } from '@/i18n/types';

export type ModuleStatusTone = 'off' | 'waiting' | 'active' | 'background';

export interface ModuleStatus {
  key: 'disabled' | 'schedule' | 'condition' | 'backgroundProvider';
  tone: ModuleStatusTone;
  /** Short enough for a chip on the canvas: "Hidden", "Mon to Fri, 7:00 AM to 9:00 AM". */
  label: string;
  /** The sentence for the property panel, where there is room for the reason. */
  detail: string;
  icon: LucideIcon;
}

export interface ModuleStatusContext {
  t: TranslateFn;
  now: Date;
  formattingLocale: string;
  timeFormat: TimeFormat | undefined;
  /** Fresh shared-state snapshot, or null when no display has reported lately. */
  verdictStates?: ReadonlyMap<string, SharedStateEntry> | null;
  /** 'editor' values drop the "on the display" claim from condition wording. */
  source?: 'display' | 'editor' | null;
}

/** Tailwind classes for the corner badge on the canvas, per tone. */
export const STATUS_BADGE_CLASS: Record<ModuleStatusTone, string> = {
  off: 'bg-red-700/70 text-red-100',
  waiting: 'bg-amber-600/70 text-amber-200',
  active: 'bg-hs-accent/70 text-white',
  background: 'bg-slate-600/70 text-slate-200',
};

/** Tailwind classes for the readable chip (canvas selection + property panel). */
export const STATUS_CHIP_CLASS: Record<ModuleStatusTone, string> = {
  off: 'bg-red-950/80 text-red-200 border-red-900',
  waiting: 'bg-amber-950/80 text-amber-200 border-amber-900/70',
  active: 'bg-hs-accent-soft text-hs-accent-hover border-hs-accent/35',
  background: 'bg-slate-800/80 text-slate-200 border-slate-600/60',
};

/** The first state key a condition tree mentions, for "waiting for <key>". */
function firstSourceKey(node: unknown): string | undefined {
  if (!node || typeof node !== 'object') return undefined;
  const n = node as Record<string, unknown>;
  if (typeof n.sourceKey === 'string' && n.sourceKey) return n.sourceKey;
  for (const child of ['conditions', 'condition']) {
    const value = n[child];
    if (Array.isArray(value)) {
      for (const entry of value) {
        const found = firstSourceKey(entry);
        if (found) return found;
      }
    } else if (value) {
      const found = firstSourceKey(value);
      if (found) return found;
    }
  }
  return undefined;
}

/**
 * Everything the editor says about why a module is or isn't on the wall right
 * now — the corner badges on the canvas, the chip on the selected module and
 * the chip in the property panel all read from this one list, so they can
 * never describe the same module differently.
 */
export function describeModuleStatus(mod: ModuleInstance, ctx: ModuleStatusContext): ModuleStatus[] {
  const { t, now, verdictStates } = ctx;
  const out: ModuleStatus[] = [];

  if (!isModuleEnabled(mod)) {
    out.push({
      key: 'disabled',
      tone: 'off',
      label: t('draggableModule.status.hidden'),
      detail: t('draggableModule.status.hiddenDetail'),
      icon: PowerOff,
    });
  } else {
    if (mod.schedule) {
      const showing = isModuleVisible(mod.schedule, now);
      const { short, sentence } = describeSchedule(mod.schedule, t, ctx.formattingLocale, ctx.timeFormat);
      out.push({
        key: 'schedule',
        tone: showing ? 'active' : 'waiting',
        label: short,
        detail: showing
          ? t('draggableModule.status.scheduledActiveDetail', { summary: sentence })
          : t('draggableModule.status.scheduledInactiveDetail', { summary: sentence }),
        icon: Clock,
      });
    }
    if ((mod.visibility?.conditions?.length ?? 0) > 0) {
      // `now` is the TZ-shifted clock the schedule badge uses. Omitting it made
      // evaluateVisibility fall back to the browser's zone, so a `time`
      // condition could disagree with both the panel and the display.
      const verdict = verdictStates
        ? (evaluateVisibility(mod.visibility, verdictStates, now) ? 'met' : 'unmet')
        : null;
      const key = firstSourceKey(mod.visibility?.conditions?.[0]);
      const onDisplay = ctx.source !== 'editor';
      out.push({
        key: 'condition',
        tone: verdict === 'met' ? 'active' : verdict === 'unmet' ? 'waiting' : 'background',
        label: key
          ? t('draggableModule.status.conditionOnKey', { key })
          : t('draggableModule.status.conditionNoKey'),
        detail:
          verdict === 'met'
            ? t(onDisplay ? 'draggableModule.conditionMetTitle' : 'draggableModule.conditionMetTitleEditor')
            : verdict === 'unmet'
              ? t(onDisplay ? 'draggableModule.conditionUnmetTitle' : 'draggableModule.conditionUnmetTitleEditor')
              : t('draggableModule.conditionGatedTitle'),
        icon: verdict === 'unmet' ? EyeOff : Eye,
      });
    }
  }

  if (mod.backgroundProvider) {
    out.push({
      key: 'backgroundProvider',
      tone: 'background',
      label: t('draggableModule.status.background'),
      detail: t('draggableModule.backgroundProviderTitle'),
      icon: EyeOff,
    });
  }

  return out;
}
