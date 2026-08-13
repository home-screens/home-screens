'use client';

import Slider from '@/components/ui/Slider';
import Toggle from '@/components/ui/Toggle';
import { useTranslate } from '@/i18n';
import SleepTimelinePreview from './SleepTimelinePreview';

export interface SleepFormValues {
  sleepEnabled: boolean;
  idleDimEnabled: boolean;
  dimAfterMinutes: number;
  sleepAfterMinutes: number;
  dimBrightness: number;
  dimScheduleEnabled: boolean;
  dimStartTime: string;
  dimEndTime: string;
  sleepScheduleEnabled: boolean;
  sleepStartTime: string;
  sleepEndTime: string;
  screensaverMode: string;
}

interface SleepFormFieldsProps {
  values: SleepFormValues;
  onChange: (updates: Partial<SleepFormValues>) => void;
  /**
   * When true the entire form goes opacity-60 + pointer-events-none, signaling
   * that the field values are inherited and the user must explicitly fork
   * the block before editing. The two consumers wire this differently:
   *   - `ScreenSection` always passes `false` (defaults are always editable)
   *   - `SleepSubtab` passes `!isForked` so the form dims until the user
   *     clicks "Override for {display}"
   */
  disabled?: boolean;
}

const TIME_INPUT_CLASS =
  'mt-1 block w-full rounded-md bg-hs-card border border-hs-border-strong text-sm text-hs-text-body px-3 py-2 focus:outline-none focus:border-hs-accent';

/**
 * The shared form body for sleep / dim schedule / screensaver settings,
 * composed by `ScreenSection` (defaults page) and `SleepSubtab` (per-display
 * drill-down) so the two surfaces can't drift apart.
 *
 * The layout groups the three independent behaviors into labeled sections —
 * idle dimming ("when nobody's using it"), the two schedules ("every day at
 * set times"), and the shared dimmed appearance ("while dimmed") — with a
 * 24-hour preview bar up top so the resulting day is visible at a glance
 * (mockup: .claude/mockups/sleep-settings-redesign.html, Variant B). The
 * "while dimmed" fields apply to any dimming source, which is why they live
 * in their own section instead of under the idle toggle; when nothing can dim
 * the display the section collapses to an explanatory note.
 */
export default function SleepFormFields({ values, onChange, disabled = false }: SleepFormFieldsProps) {
  const t = useTranslate('editor');
  const {
    sleepEnabled,
    idleDimEnabled,
    dimAfterMinutes,
    sleepAfterMinutes,
    dimBrightness,
    dimScheduleEnabled,
    dimStartTime,
    dimEndTime,
    sleepScheduleEnabled,
    sleepStartTime,
    sleepEndTime,
    screensaverMode,
  } = values;

  const somethingDims = idleDimEnabled || dimScheduleEnabled;

  return (
    <div className={`space-y-3 ${disabled ? 'opacity-60 pointer-events-none' : ''}`}>
      <div data-field-id="sleep.sleepEnabled">
        <Toggle
          label={t('settings.sleepFormFields.enableLabel')}
          checked={sleepEnabled}
          disabled={disabled}
          onChange={(v) => onChange({ sleepEnabled: v })}
        />
      </div>
      <p className="text-xs text-hs-text-faint">{t('settings.sleepFormFields.enableHelp')}</p>

      {sleepEnabled && (
        <>
          <SleepTimelinePreview
            dimWindow={dimScheduleEnabled ? { startTime: dimStartTime, endTime: dimEndTime } : undefined}
            sleepWindow={sleepScheduleEnabled ? { startTime: sleepStartTime, endTime: sleepEndTime } : undefined}
            idleDimEnabled={idleDimEnabled}
            dimAfterMinutes={dimAfterMinutes}
          />

          {/* ── When nobody's using it ─────────────────────────────── */}
          <div className="rounded-lg border border-hs-border-strong p-3.5 space-y-3">
            <p className="text-[11px] uppercase tracking-wider text-hs-text-faint">
              {t('settings.sleepFormFields.idleSectionTitle')}
            </p>
            <div data-field-id="sleep.idleDimEnabled">
              <Toggle
                label={t('settings.sleepFormFields.idleDimLabel')}
                checked={idleDimEnabled}
                disabled={disabled}
                onChange={(v) => onChange({ idleDimEnabled: v })}
              />
            </div>
            {!idleDimEnabled && (
              <p className="text-xs text-hs-text-faint">{t('settings.sleepFormFields.idleDimOffHelp')}</p>
            )}
            {idleDimEnabled && (
              <>
                <div data-field-id="sleep.dimAfterMinutes">
                  <Slider
                    label={t('settings.sleepFormFields.dimAfterLabel')}
                    value={dimAfterMinutes}
                    min={1}
                    max={60}
                    onChange={(v) => onChange({ dimAfterMinutes: v })}
                    disabled={disabled}
                  />
                </div>
                <div data-field-id="sleep.sleepAfterMinutes">
                  <Slider
                    label={t('settings.sleepFormFields.sleepAfterLabel')}
                    value={sleepAfterMinutes}
                    min={0}
                    max={120}
                    displayValue={sleepAfterMinutes === 0 ? t('settings.sleepFormFields.sleepAfterOff') : String(sleepAfterMinutes)}
                    onChange={(v) => onChange({ sleepAfterMinutes: v })}
                    disabled={disabled}
                  />
                </div>
                {sleepAfterMinutes === 0 && (
                  <p className="text-xs text-hs-text-faint -mt-1">{t('settings.sleepFormFields.sleepAfterHelp')}</p>
                )}
              </>
            )}
          </div>

          {/* ── Every day at set times ─────────────────────────────── */}
          <div className="rounded-lg border border-hs-border-strong p-3.5 space-y-3">
            <p className="text-[11px] uppercase tracking-wider text-hs-text-faint">
              {t('settings.sleepFormFields.scheduleSectionTitle')}
            </p>
            <div data-field-id="sleep.dimScheduleEnabled">
              <Toggle
                label={t('settings.sleepFormFields.dimScheduleLabel')}
                checked={dimScheduleEnabled}
                disabled={disabled}
                onChange={(v) => onChange({ dimScheduleEnabled: v })}
              />
            </div>
            {dimScheduleEnabled && (
              <div className="grid grid-cols-2 gap-3">
                <label className="block" data-field-id="sleep.dimStartTime">
                  <span className="text-xs text-hs-text-muted">{t('settings.sleepFormFields.dimAtLabel')}</span>
                  <input
                    type="time"
                    value={dimStartTime}
                    disabled={disabled}
                    onChange={(e) => onChange({ dimStartTime: e.target.value })}
                    className={TIME_INPUT_CLASS}
                  />
                </label>
                <label className="block" data-field-id="sleep.dimEndTime">
                  <span className="text-xs text-hs-text-muted">{t('settings.sleepFormFields.brightenAtLabel')}</span>
                  <input
                    type="time"
                    value={dimEndTime}
                    disabled={disabled}
                    onChange={(e) => onChange({ dimEndTime: e.target.value })}
                    className={TIME_INPUT_CLASS}
                  />
                </label>
              </div>
            )}

            <div className="border-t border-hs-border-subtle pt-3" data-field-id="sleep.sleepScheduleEnabled">
              <Toggle
                label={t('settings.sleepFormFields.sleepScheduleLabel')}
                checked={sleepScheduleEnabled}
                disabled={disabled}
                onChange={(v) => onChange({ sleepScheduleEnabled: v })}
              />
            </div>
            {sleepScheduleEnabled && (
              <div className="grid grid-cols-2 gap-3">
                <label className="block" data-field-id="sleep.sleepStartTime">
                  <span className="text-xs text-hs-text-muted">{t('settings.sleepFormFields.sleepAtLabel')}</span>
                  <input
                    type="time"
                    value={sleepStartTime}
                    disabled={disabled}
                    onChange={(e) => onChange({ sleepStartTime: e.target.value })}
                    className={TIME_INPUT_CLASS}
                  />
                </label>
                <label className="block" data-field-id="sleep.sleepEndTime">
                  <span className="text-xs text-hs-text-muted">{t('settings.sleepFormFields.wakeAtLabel')}</span>
                  <input
                    type="time"
                    value={sleepEndTime}
                    disabled={disabled}
                    onChange={(e) => onChange({ sleepEndTime: e.target.value })}
                    className={TIME_INPUT_CLASS}
                  />
                </label>
                <p className="col-span-2 text-xs text-hs-text-faint">
                  {t('settings.sleepFormFields.sleepScheduleHelp')}
                </p>
              </div>
            )}
          </div>

          {/* ── While dimmed ───────────────────────────────────────── */}
          {/* The screensaver select stays visible even when nothing here can
              dim the display: remote brightness (display-control module or
              /remote) dims through its own brightnessOverride and still shows
              the screensaver, so its control must remain reachable. Only the
              brightness slider is truly inert in that state — remote dimming
              supplies its own level. */}
          <div className="rounded-lg border border-hs-border-strong p-3.5 space-y-3">
            <p className="text-[11px] uppercase tracking-wider text-hs-text-faint">
              {t('settings.sleepFormFields.dimmedSectionTitle')}
            </p>
            {!somethingDims && (
              <p className="text-xs text-hs-text-faint">{t('settings.sleepFormFields.nothingDimsNote')}</p>
            )}
            {somethingDims && (
              <div data-field-id="sleep.dimBrightness">
                <Slider
                  label={t('settings.sleepFormFields.dimBrightnessLabel')}
                  value={dimBrightness}
                  min={5}
                  max={80}
                  step={5}
                  onChange={(v) => onChange({ dimBrightness: v })}
                  disabled={disabled}
                />
              </div>
            )}
            <label className="block" data-field-id="sleep.screensaverMode">
              <span className="text-xs text-hs-text-muted">{t('settings.sleepFormFields.screensaverLabel')}</span>
              <select
                value={screensaverMode}
                disabled={disabled}
                onChange={(e) => onChange({ screensaverMode: e.target.value })}
                className="mt-1 block w-full rounded-md bg-hs-card border border-hs-border-strong text-sm text-hs-text-body px-3 py-2 focus:outline-none focus:border-hs-accent disabled:opacity-70"
              >
                <option value="clock">{t('settings.sleepFormFields.screensaverClock')}</option>
                <option value="blank">{t('settings.sleepFormFields.screensaverBlank')}</option>
                <option value="off">{t('settings.sleepFormFields.screensaverOff')}</option>
              </select>
            </label>
            <p className="text-xs text-hs-text-faint">{t('settings.sleepFormFields.dimmedSectionHelp')}</p>
          </div>
        </>
      )}
    </div>
  );
}
