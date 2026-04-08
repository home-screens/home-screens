'use client';

import Link from 'next/link';
import { Info, RotateCcw } from 'lucide-react';
import type {
  DisplayNode,
  GlobalSettings,
  ScreensaverSettings,
  ScreenConfiguration,
  SleepSettings,
} from '@/types/config';
import { useEditorStore } from '@/stores/editor-store';
import SleepFormFields, {
  type SleepFormValues,
} from './SleepFormFields';

interface SleepSubtabProps {
  config: ScreenConfiguration;
  display: DisplayNode;
}

/**
 * Display detail "Sleep" — whole-block override of the shared
 * `Defaults → Sleep` settings.
 *
 * Sleep is overridden as a single full-replacement unit because the
 * shallow merge in `display-filter.ts` says nested objects (sleep,
 * screensaver, alerts) are never deep-merged. The user clicks
 * "Override for {display}" once to fork the whole block from defaults;
 * from then on every field on this page edits the per-display copy.
 * They can also click "Reset to default" to drop the entire fork.
 *
 * Phase 5 inlined the legacy `SleepSection` wrapper. The form body
 * now lives in the shared `SleepFormFields` component which both this
 * subtab and `DefaultSleepSection` compose. The fork affordance moved
 * to a header row inside the rounded card here, matching the mockup's
 * "single rounded card with override button at the top" CTA layout.
 */
export default function SleepSubtab({ config, display }: SleepSubtabProps) {
  const { updateDisplaySettings, saveConfig } = useEditorStore();
  const isForked = !!(display.settings?.sleep || display.settings?.screensaver);
  // Resolve each half independently against the global default. If only one
  // of `sleep` / `screensaver` is overridden, the other half must still
  // hydrate from `config.settings` — otherwise `sleepConfigToForm` would
  // paper over the gap with its hardcoded `??` fallbacks (e.g. dimAfterMinutes
  // defaults to 10) and the user would see constants in place of the real
  // inherited values while `isForked === true`.
  const effectiveSleep = display.settings?.sleep ?? config.settings.sleep;
  const effectiveScreensaver = display.settings?.screensaver ?? config.settings.screensaver;
  const values: SleepFormValues = sleepConfigToForm(effectiveSleep, effectiveScreensaver);

  const handleChange = async (updates: Partial<SleepFormValues>) => {
    if (!isForked) return; // Can't edit while inheriting — the form is dimmed
    const merged = { ...values, ...updates };
    const { sleep, screensaver } = sleepFormToConfig(merged);
    updateDisplaySettings(display.id, { sleep, screensaver });
    await saveConfig();
  };

  const handleFork = async () => {
    // Seed both override fields from the current global form state so
    // the user sees no behavior change until they edit a sub-control.
    const { sleep, screensaver } = sleepFormToConfig(
      sleepConfigToForm(config.settings.sleep, config.settings.screensaver),
    );
    updateDisplaySettings(display.id, { sleep, screensaver });
    await saveConfig();
  };

  const handleReset = async () => {
    updateDisplaySettings(display.id, { sleep: undefined, screensaver: undefined });
    await saveConfig();
  };

  return (
    <>
      <div className="mb-4 rounded-lg border border-blue-500/20 bg-blue-500/[0.07] px-4 py-3 flex items-start gap-3">
        <Info className="w-4 h-4 text-blue-300 shrink-0 mt-0.5" />
        <div className="text-xs text-blue-200 leading-relaxed">
          Sleep is overridden as a whole block — you can&apos;t fork individual fields like dim
          time. The default lives on{' '}
          <Link
            href="?section=defaults&page=sleep"
            className="text-blue-300 hover:text-blue-200 underline decoration-dashed underline-offset-2"
          >
            Defaults → Sleep
          </Link>
          .
        </div>
      </div>

      <div className="rounded-lg border border-neutral-800 bg-neutral-900/40">
        <div className="px-4 py-3.5">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-medium text-neutral-200">Sleep schedule</div>
            {isForked ? (
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-md text-blue-300 bg-blue-500/10 border border-blue-500/30 hover:bg-blue-500/20 transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                Reset to default
              </button>
            ) : (
              <button
                type="button"
                onClick={handleFork}
                className="text-[11px] font-medium px-2.5 py-1 rounded-md text-neutral-300 bg-neutral-800 border border-neutral-700 hover:text-neutral-100 hover:bg-neutral-700 transition-colors"
              >
                Override for {display.name}
              </button>
            )}
          </div>
          <SleepFormFields values={values} onChange={handleChange} disabled={!isForked} />
          {!isForked && (
            <p className="text-[11px] text-neutral-500 mt-3">
              Using the default from{' '}
              <Link
                href="?section=defaults&page=sleep"
                className="text-blue-400 hover:text-blue-300 underline decoration-dashed underline-offset-2"
              >
                Defaults → Sleep
              </Link>
              .
            </p>
          )}
        </div>
      </div>
    </>
  );
}

/* ─── Form ↔ config transforms (mirror settings/page.tsx) ─────── */

function sleepConfigToForm(
  sleep: SleepSettings | undefined,
  screensaver: ScreensaverSettings | undefined,
): SleepFormValues {
  return {
    sleepEnabled: sleep?.enabled ?? false,
    dimAfterMinutes: sleep?.dimAfterMinutes ?? 10,
    sleepAfterMinutes: sleep?.sleepAfterMinutes ?? 0,
    dimBrightness: sleep?.dimBrightness ?? 20,
    dimScheduleEnabled: !!sleep?.dimSchedule,
    dimStartTime: sleep?.dimSchedule?.startTime ?? '23:00',
    dimEndTime: sleep?.dimSchedule?.endTime ?? '06:00',
    sleepScheduleEnabled: !!sleep?.schedule,
    sleepStartTime: sleep?.schedule?.startTime ?? '23:00',
    sleepEndTime: sleep?.schedule?.endTime ?? '06:00',
    screensaverMode: screensaver?.mode ?? 'clock',
  };
}

function sleepFormToConfig(form: SleepFormValues): {
  sleep: NonNullable<GlobalSettings['sleep']>;
  screensaver: NonNullable<GlobalSettings['screensaver']>;
} {
  return {
    sleep: {
      enabled: form.sleepEnabled,
      dimAfterMinutes: form.dimAfterMinutes,
      sleepAfterMinutes: form.sleepAfterMinutes,
      dimBrightness: form.dimBrightness,
      ...(form.dimScheduleEnabled
        ? { dimSchedule: { startTime: form.dimStartTime, endTime: form.dimEndTime } }
        : {}),
      ...(form.sleepScheduleEnabled
        ? { schedule: { startTime: form.sleepStartTime, endTime: form.sleepEndTime } }
        : {}),
    },
    screensaver: {
      mode: form.screensaverMode as 'clock' | 'blank' | 'off',
    },
  };
}
