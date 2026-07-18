'use client';

import Link from 'next/link';
import type {
  DisplayNode,
  GlobalSettings,
  ScreensaverSettings,
  ScreenConfiguration,
  SleepSettings,
} from '@/types/config';
import { useEditorStore } from '@/stores/editor-store';
import { useTranslate } from '@/i18n';
import SleepFormFields, {
  type SleepFormValues,
} from './SleepFormFields';
import WholeBlockOverrideCard from './WholeBlockOverrideCard';

interface SleepSubtabProps {
  config: ScreenConfiguration;
  display: DisplayNode;
}

/**
 * Sleep card on the per-display Overrides subtab — whole-block override
 * of the shared sleep settings from `Defaults → Screen`.
 *
 * Sleep is overridden as a single full-replacement unit because the
 * shallow merge in `display-filter.ts` says nested objects (sleep,
 * screensaver, alerts) are never deep-merged. The user clicks
 * "Override for {display}" once to fork the whole block from defaults;
 * from then on every field on this page edits the per-display copy.
 * They can also click "Reset to default" to drop the entire fork.
 *
 * The legacy `SleepSection` wrapper was inlined. The form body now
 * lives in the shared `SleepFormFields` component which both this
 * subtab and `ScreenSection` compose. The fork affordance moved
 * to a header row inside the rounded card here, matching the mockup's
 * "single rounded card with override button at the top" CTA layout.
 */
export default function SleepSubtab({ config, display }: SleepSubtabProps) {
  const t = useTranslate('editor');
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
    <WholeBlockOverrideCard
      label={t('settings.perDisplayPage.sleep.label')}
      displayName={display.name}
      defaultsHref="?section=defaults&page=screen"
      defaultsLabel={t('settings.perDisplayPage.sleep.defaultsLabel')}
      infoCopy={
        <>
          {t('settings.perDisplayPage.sleep.infoPart1')}
          <Link
            href="?section=defaults&page=screen"
            className="text-hs-accent hover:text-hs-accent-hover underline decoration-dashed underline-offset-2"
          >
            {t('settings.perDisplayPage.sleep.defaultsLabel')}
          </Link>
          {t('settings.perDisplayPage.sleep.infoPart2')}
        </>
      }
      isForked={isForked}
      onFork={handleFork}
      onReset={handleReset}
      testId="sleep-override-card"
    >
      <SleepFormFields values={values} onChange={handleChange} disabled={!isForked} />
    </WholeBlockOverrideCard>
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
