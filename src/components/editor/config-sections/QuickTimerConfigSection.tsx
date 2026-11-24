'use client';

import { useModuleConfig } from '@/hooks/useModuleConfig';
import Toggle from '@/components/ui/Toggle';
import { useTranslate } from '@/i18n';
import type { ModuleInstance, QuickTimerConfig } from '@/types/config';
import { DEFAULT_PRESET_MINUTES, MAX_PRESETS } from '@/components/modules/QuickTimerModule';

/** The lengths offered. Free entry would let someone type 7, which nobody
 *  wants on a wall button, and 0, which is not a timer. */
const PRESET_CHOICES = [1, 2, 3, 5, 10, 15, 20, 30, 45, 60];

const VIEWS: Array<QuickTimerConfig['timerView']> = ['ring', 'face', 'cascade', 'path'];

const chipClass = (active: boolean) =>
  `px-3 py-2 rounded-lg border text-sm transition-colors ${
    active
      ? 'border-hs-accent bg-hs-accent-soft text-hs-accent-hover'
      : 'border-hs-border-strong bg-hs-card text-hs-text-muted hover:text-hs-text-secondary'
  }`;

export function QuickTimerConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const t = useTranslate('editor');
  const { config: c, set } = useModuleConfig<QuickTimerConfig>(mod, screenId);

  const presets = c.presetMinutes ?? DEFAULT_PRESET_MINUTES;
  const atLimit = presets.length >= MAX_PRESETS;
  const fullScreen = c.fullScreen ?? true;

  /** Toggling keeps the menu's own order, so the buttons read 1, 5, 10, 15
   *  however they were picked. The last one cannot be removed: a Quick Timer
   *  with no lengths is a box that does nothing. */
  const togglePreset = (minutes: number) => {
    const next = presets.includes(minutes)
      ? presets.filter((p) => p !== minutes)
      : PRESET_CHOICES.filter((p) => p === minutes || presets.includes(p));
    if (next.length === 0 || next.length > MAX_PRESETS) return;
    set({ presetMinutes: next });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-1" data-field-id="presetMinutes">
        <span className="text-xs text-hs-text-muted uppercase tracking-wider">
          {t('configSections.quick-timer.presets')}
        </span>
        <div className="flex flex-wrap gap-2 mt-1">
          {PRESET_CHOICES.map((minutes) => {
            const on = presets.includes(minutes);
            return (
              <button
                key={minutes}
                type="button"
                aria-pressed={on}
                disabled={!on && atLimit}
                onClick={() => togglePreset(minutes)}
                className={`${chipClass(on)} ${!on && atLimit ? 'opacity-40' : ''}`}
              >
                {t('configSections.quick-timer.minutesShort', { minutes })}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-hs-text-faint mt-1">
          {t('configSections.quick-timer.presetsHint', { max: MAX_PRESETS })}
        </p>
      </div>

      <div data-field-id="fullScreen">
        <Toggle
          label={t('configSections.quick-timer.fullScreen')}
          description={t('configSections.quick-timer.fullScreenHint')}
          checked={fullScreen}
          onChange={(v) => set({ fullScreen: v })}
        />
      </div>

      {/* The four drawings are the takeover's; a timer kept in its box always
          shows the same numbers, so the choice goes away rather than sitting
          there doing nothing. */}
      {fullScreen && (
        <div className="flex flex-col gap-1" data-field-id="timerView">
          <span className="text-xs text-hs-text-muted uppercase tracking-wider">
            {t('configSections.quick-timer.view')}
          </span>
          <div className="grid grid-cols-2 gap-2 mt-1">
            {VIEWS.map((view) => (
              <button
                key={view}
                type="button"
                aria-pressed={(c.timerView ?? 'face') === view}
                onClick={() => set({ timerView: view })}
                className={chipClass((c.timerView ?? 'face') === view)}
              >
                {t(`configSections.quick-timer.view-${view}`)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1" data-field-id="timerTarget">
        <span className="text-xs text-hs-text-muted uppercase tracking-wider">
          {t('configSections.quick-timer.target')}
        </span>
        <div className="grid grid-cols-2 gap-2 mt-1">
          {(['all', 'this'] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              aria-pressed={(c.timerTarget ?? 'all') === opt}
              onClick={() => set({ timerTarget: opt })}
              className={chipClass((c.timerTarget ?? 'all') === opt)}
            >
              {t(`configSections.quick-timer.target-${opt}`)}
            </button>
          ))}
        </div>
      </div>

      <div data-field-id="timerSound">
        <Toggle
          label={t('configSections.quick-timer.sound')}
          checked={c.timerSound ?? true}
          onChange={(v) => set({ timerSound: v })}
        />
      </div>
    </div>
  );
}
