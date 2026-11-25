'use client';

import Slider from '@/components/ui/Slider';
import Toggle from '@/components/ui/Toggle';
import { useTranslate } from '@/i18n';
import HomeTimeHint from '@/components/editor/HomeTimeHint';
import SleepTimelinePreview from './SleepTimelinePreview';
import { SETTINGS_INPUT_CLASS } from '@/components/ui/input-classes';
import FieldHint from '@/components/ui/FieldHint';
import { SettingsSubHeading } from '@/components/editor/settings/shared/SettingsPanel';

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
  wakeHoldMinutes: number;
  panelPowerOff: boolean;
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
  `mt-1 block w-full ${SETTINGS_INPUT_CLASS}`;

/**
 * The shared form body for sleep / dim schedule / screensaver settings,
 * composed by `ScreenSection` (defaults page) and `SleepSubtab` (per-display
 * drill-down) so the two surfaces can't drift apart.
 *
 * The layout groups the three independent behaviors into labeled sections —
 * idle dimming ("when nobody's using it"), the two schedules ("every day at
 * set times"), and the shared dimmed appearance ("while dimmed") — with a
 * 24-hour preview bar up top so the resulting day is visible at a glance. The
 * "while dimmed" fields apply to both the idle and the scheduled dim, which is
 * why they live in their own section instead of under the idle toggle; when
 * neither is on the brightness slider gives way to an explanatory note.
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
    wakeHoldMinutes,
    panelPowerOff,
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
      <FieldHint>{t('settings.sleepFormFields.enableHelp')}</FieldHint>

      {/* The timeline stays on screen while sleep is off, greyed out. Hiding
          it left the tab as a lone toggle with nothing to judge: the only way
          to find out what turning it on would do was to turn it on. Greyed,
          it previews the shape of the schedule and the sentence below states
          the behaviour you have right now. */}
      {!sleepEnabled && (
        <>
          <div className="opacity-40 pointer-events-none" aria-hidden="true">
            <SleepTimelinePreview
              dimWindow={dimScheduleEnabled ? { startTime: dimStartTime, endTime: dimEndTime } : undefined}
              sleepWindow={sleepScheduleEnabled ? { startTime: sleepStartTime, endTime: sleepEndTime } : undefined}
              idleDimEnabled={idleDimEnabled}
              dimAfterMinutes={dimAfterMinutes}
            />
          </div>
          <FieldHint>{t('settings.sleepFormFields.disabledHelp')}</FieldHint>
        </>
      )}

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
            <SettingsSubHeading>
              {t('settings.sleepFormFields.idleSectionTitle')}
            </SettingsSubHeading>
            <div data-field-id="sleep.idleDimEnabled">
              <Toggle
                label={t('settings.sleepFormFields.idleDimLabel')}
                checked={idleDimEnabled}
                disabled={disabled}
                onChange={(v) => onChange({ idleDimEnabled: v })}
              />
            </div>
            {!idleDimEnabled && (
              <FieldHint>{t('settings.sleepFormFields.idleDimOffHelp')}</FieldHint>
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
                  <FieldHint className="-mt-1">{t('settings.sleepFormFields.sleepAfterHelp')}</FieldHint>
                )}
              </>
            )}
          </div>

          {/* ── Every day at set times ─────────────────────────────── */}
          <div className="rounded-lg border border-hs-border-strong p-3.5 space-y-3">
            <SettingsSubHeading>
              {t('settings.sleepFormFields.scheduleSectionTitle')}
            </SettingsSubHeading>
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
                <FieldHint className="col-span-2">
                  {t('settings.sleepFormFields.sleepScheduleHelp')}
                </FieldHint>
              </div>
            )}

            {(dimScheduleEnabled || sleepScheduleEnabled) && <HomeTimeHint className="-mt-1.5" />}

            {/* The wake-hold applies to both schedule windows, so it shows
                whenever either schedule is on — waking a dimmed-by-schedule
                display has the same "re-asserts in seconds" problem as a
                sleeping one. */}
            {(dimScheduleEnabled || sleepScheduleEnabled) && (
              <div className="border-t border-hs-border-subtle pt-3 space-y-2">
                <div data-field-id="sleep.wakeHoldMinutes">
                  <Slider
                    label={t('settings.sleepFormFields.wakeHoldLabel')}
                    value={wakeHoldMinutes}
                    min={0}
                    max={60}
                    displayValue={wakeHoldMinutes === 0 ? t('settings.sleepFormFields.wakeHoldOff') : String(wakeHoldMinutes)}
                    onChange={(v) => onChange({ wakeHoldMinutes: v })}
                    disabled={disabled}
                  />
                </div>
                <FieldHint>
                  {t('settings.sleepFormFields.wakeHoldHelp')}
                </FieldHint>
              </div>
            )}
          </div>

          {/* ── While dimmed ───────────────────────────────────────── */}
          {/* Both fields belong to the idle and scheduled dims only. Remote
              brightness (the phone, a Display Control slider) dims through its
              own brightnessOverride, at its own level and with no screensaver
              (SleepOverlay). So with neither dim on, the brightness slider
              goes and the note says the screensaver will not show; the select
              stays, keeping the choice for when a dim is turned on. */}
          <div className="rounded-lg border border-hs-border-strong p-3.5 space-y-3">
            <SettingsSubHeading>
              {t('settings.sleepFormFields.dimmedSectionTitle')}
            </SettingsSubHeading>
            {!somethingDims && (
              <FieldHint>{t('settings.sleepFormFields.nothingDimsNote')}</FieldHint>
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
                className={`mt-1 block w-full ${SETTINGS_INPUT_CLASS} disabled:opacity-70`}
              >
                <option value="clock">{t('settings.sleepFormFields.screensaverClock')}</option>
                <option value="blank">{t('settings.sleepFormFields.screensaverBlank')}</option>
              </select>
            </label>
            <FieldHint>{t('settings.sleepFormFields.dimmedSectionHelp')}</FieldHint>
          </div>

          {/* ── While turned off ───────────────────────────────────── */}
          {/* Sleep itself is a black layer over the page; this is the one
              control that reaches the hardware. It rides the browser's
              reported sleep state, so every sleep source (idle, schedule,
              remote, rules) and every wake source works the same. Opt-in:
              it needs the kiosk's power agent and a screen that comes back
              from a signal loss on its own. */}
          <div className="rounded-lg border border-hs-border-strong p-3.5 space-y-3">
            <SettingsSubHeading>
              {t('settings.sleepFormFields.powerSectionTitle')}
            </SettingsSubHeading>
            <div data-field-id="sleep.panelPowerOff">
              <Toggle
                label={t('settings.sleepFormFields.panelPowerOffLabel')}
                checked={panelPowerOff}
                onChange={(v) => onChange({ panelPowerOff: v })}
                disabled={disabled}
              />
            </div>
            <FieldHint>{t('settings.sleepFormFields.panelPowerOffHelp')}</FieldHint>
          </div>
        </>
      )}
    </div>
  );
}
