'use client';

import Slider from '@/components/ui/Slider';

export interface SleepFormValues {
  sleepEnabled: boolean;
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
   *   - `DefaultSleepSection` always passes `false` (defaults are always editable)
   *   - `SleepSubtab` passes `!isForked` so the form dims until the user
   *     clicks "Override for {display}"
   */
  disabled?: boolean;
}

/**
 * The shared form body for sleep / dim schedule / screensaver settings.
 *
 * Extracted from the legacy `SleepSection` into its two consumers
 * (`DefaultSleepSection` for the defaults page, `SleepSubtab` for the
 * per-display drill-down). Both consumers want exactly the same field
 * rows but render different chrome around them — Defaults shows just
 * the form, SleepSubtab wraps it in a rounded card with an Override
 * call-to-action header. This component is the one place the form
 * rendering lives so the two consumers can't drift apart.
 */
export default function SleepFormFields({ values, onChange, disabled = false }: SleepFormFieldsProps) {
  const {
    sleepEnabled,
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

  return (
    <div className={`space-y-3 ${disabled ? 'opacity-60 pointer-events-none' : ''}`}>
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={sleepEnabled}
          disabled={disabled}
          onChange={(e) => onChange({ sleepEnabled: e.target.checked })}
          className="rounded border-hs-border-strong bg-hs-card text-hs-accent focus:ring-hs-accent focus:ring-offset-0"
        />
        <span className="text-sm text-hs-text-body">Enable display sleep</span>
      </label>
      <p className="text-xs text-hs-text-faint">
        Dim and optionally turn off the display after inactivity or on a schedule. Any mouse, touch,
        or keyboard input wakes it up.
      </p>

      {sleepEnabled && (
        <>
          <Slider
            label="Dim after (minutes)"
            value={dimAfterMinutes}
            min={1}
            max={60}
            onChange={(v) => onChange({ dimAfterMinutes: v })}
            disabled={disabled}
          />
          <Slider
            label="Sleep after dimming (minutes)"
            value={sleepAfterMinutes}
            min={0}
            max={120}
            displayValue={sleepAfterMinutes === 0 ? 'Off' : String(sleepAfterMinutes)}
            onChange={(v) => onChange({ sleepAfterMinutes: v })}
            disabled={disabled}
          />
          {sleepAfterMinutes === 0 && (
            <p className="text-xs text-hs-text-faint -mt-1">
              The display will dim but never go fully black from inactivity.
            </p>
          )}
          <Slider
            label="Dim brightness (%)"
            value={dimBrightness}
            min={5}
            max={80}
            step={5}
            onChange={(v) => onChange({ dimBrightness: v })}
            disabled={disabled}
          />

          <label className="block">
            <span className="text-xs text-hs-text-muted">Screensaver</span>
            <select
              value={screensaverMode}
              disabled={disabled}
              onChange={(e) => onChange({ screensaverMode: e.target.value })}
              className="mt-1 block w-full rounded-md bg-hs-card border border-hs-border-strong text-sm text-hs-text-body px-3 py-2 focus:outline-none focus:border-hs-accent disabled:opacity-70"
            >
              <option value="clock">Drifting clock</option>
              <option value="blank">Blank (dim only)</option>
              <option value="off">Off (skip to sleep)</option>
            </select>
            <p className="text-xs text-hs-text-faint mt-1">
              Shown during the dimmed state, before the display fully sleeps.
            </p>
          </label>

          <label className="flex items-center gap-2 cursor-pointer mt-2">
            <input
              type="checkbox"
              checked={dimScheduleEnabled}
              disabled={disabled}
              onChange={(e) => onChange({ dimScheduleEnabled: e.target.checked })}
              className="rounded border-hs-border-strong bg-hs-card text-hs-accent focus:ring-hs-accent focus:ring-offset-0"
            />
            <span className="text-sm text-hs-text-body">Dim on a schedule</span>
          </label>

          {dimScheduleEnabled && (
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs text-hs-text-muted">Dim at</span>
                <input
                  type="time"
                  value={dimStartTime}
                  disabled={disabled}
                  onChange={(e) => onChange({ dimStartTime: e.target.value })}
                  className="mt-1 block w-full rounded-md bg-hs-card border border-hs-border-strong text-sm text-hs-text-body px-3 py-2 focus:outline-none focus:border-hs-accent"
                />
              </label>
              <label className="block">
                <span className="text-xs text-hs-text-muted">Brighten at</span>
                <input
                  type="time"
                  value={dimEndTime}
                  disabled={disabled}
                  onChange={(e) => onChange({ dimEndTime: e.target.value })}
                  className="mt-1 block w-full rounded-md bg-hs-card border border-hs-border-strong text-sm text-hs-text-body px-3 py-2 focus:outline-none focus:border-hs-accent"
                />
              </label>
              <p className="col-span-2 text-xs text-hs-text-faint">
                Dims the display during this window and automatically brightens when it ends. Supports
                overnight spans.
              </p>
            </div>
          )}

          <label className="flex items-center gap-2 cursor-pointer mt-2">
            <input
              type="checkbox"
              checked={sleepScheduleEnabled}
              disabled={disabled}
              onChange={(e) => onChange({ sleepScheduleEnabled: e.target.checked })}
              className="rounded border-hs-border-strong bg-hs-card text-hs-accent focus:ring-hs-accent focus:ring-offset-0"
            />
            <span className="text-sm text-hs-text-body">Sleep on a schedule</span>
          </label>

          {sleepScheduleEnabled && (
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs text-hs-text-muted">Sleep at</span>
                <input
                  type="time"
                  value={sleepStartTime}
                  disabled={disabled}
                  onChange={(e) => onChange({ sleepStartTime: e.target.value })}
                  className="mt-1 block w-full rounded-md bg-hs-card border border-hs-border-strong text-sm text-hs-text-body px-3 py-2 focus:outline-none focus:border-hs-accent"
                />
              </label>
              <label className="block">
                <span className="text-xs text-hs-text-muted">Wake at</span>
                <input
                  type="time"
                  value={sleepEndTime}
                  disabled={disabled}
                  onChange={(e) => onChange({ sleepEndTime: e.target.value })}
                  className="mt-1 block w-full rounded-md bg-hs-card border border-hs-border-strong text-sm text-hs-text-body px-3 py-2 focus:outline-none focus:border-hs-accent"
                />
              </label>
              <p className="col-span-2 text-xs text-hs-text-faint">
                Forces the display fully off during this window and automatically wakes when it ends.
                Ignores activity. Supports overnight spans.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
