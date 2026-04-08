'use client';

import Slider from '@/components/ui/Slider';
import ForkBanner from '@/components/editor/settings/ForkBanner';

interface SleepSettings {
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

/**
 * Per-display fork affordance. In single-display mode this prop is
 * undefined and the section edits the global Sleep settings directly.
 * In multi-display mode:
 *   - When `isForked` is false, the section renders the global values as
 *     read-only with a "Override Sleep for <display>" button at the top.
 *   - When `isForked` is true, the section renders the display-specific
 *     values (passed via `values`) as editable, with a "Reset to inherited"
 *     link at the top. Nested-object overrides are full-replacement by
 *     contract, so the whole Sleep+screensaver block is forked as one unit.
 */
interface SleepForkProps {
  isForked: boolean;
  displayName: string;
  onFork: () => void;
  onReset: () => void;
}

interface Props {
  values: SleepSettings;
  onChange: (updates: Partial<SleepSettings>) => void;
  fork?: SleepForkProps;
}

export default function SleepSection({ values, onChange, fork }: Props) {
  const {
    sleepEnabled, dimAfterMinutes, sleepAfterMinutes, dimBrightness,
    dimScheduleEnabled, dimStartTime, dimEndTime,
    sleepScheduleEnabled, sleepStartTime, sleepEndTime,
    screensaverMode,
  } = values;

  const isInherited = fork && !fork.isForked;

  return (
    <section>
      <h3 className="text-sm font-medium text-neutral-300 mb-3 uppercase tracking-wider">
        Sleep &amp; Screensaver
      </h3>
      {fork && (
        <ForkBanner
          label="Sleep settings"
          displayName={fork.displayName}
          isForked={fork.isForked}
          onFork={fork.onFork}
          onReset={fork.onReset}
        />
      )}
      <div className={`space-y-3 ${isInherited ? 'opacity-60 pointer-events-none' : ''}`}>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={sleepEnabled}
            onChange={(e) => onChange({ sleepEnabled: e.target.checked })}
            className="rounded border-neutral-600 bg-neutral-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
          />
          <span className="text-sm text-neutral-200">Enable display sleep</span>
        </label>
        <p className="text-xs text-neutral-500">
          Dim and optionally turn off the display after inactivity or on a schedule. Any mouse, touch, or keyboard input wakes it up.
        </p>

        {sleepEnabled && (
          <>
            <Slider
              label="Dim after (minutes)"
              value={dimAfterMinutes}
              min={1}
              max={60}
              onChange={(v) => onChange({ dimAfterMinutes: v })}
            />
            <Slider
              label="Sleep after dimming (minutes)"
              value={sleepAfterMinutes}
              min={0}
              max={120}
              displayValue={sleepAfterMinutes === 0 ? 'Off' : String(sleepAfterMinutes)}
              onChange={(v) => onChange({ sleepAfterMinutes: v })}
            />
            {sleepAfterMinutes === 0 && (
              <p className="text-xs text-neutral-500 -mt-1">
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
            />

            <label className="block">
              <span className="text-xs text-neutral-400">Screensaver</span>
              <select
                value={screensaverMode}
                onChange={(e) => onChange({ screensaverMode: e.target.value })}
                className="mt-1 block w-full rounded-md bg-neutral-800 border border-neutral-600 text-sm text-neutral-200 px-3 py-2 focus:outline-none focus:border-blue-500"
              >
                <option value="clock">Drifting clock</option>
                <option value="blank">Blank (dim only)</option>
                <option value="off">Off (skip to sleep)</option>
              </select>
              <p className="text-xs text-neutral-500 mt-1">
                Shown during the dimmed state, before the display fully sleeps.
              </p>
            </label>

            <label className="flex items-center gap-2 cursor-pointer mt-2">
              <input
                type="checkbox"
                checked={dimScheduleEnabled}
                onChange={(e) => onChange({ dimScheduleEnabled: e.target.checked })}
                className="rounded border-neutral-600 bg-neutral-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
              />
              <span className="text-sm text-neutral-200">Dim on a schedule</span>
            </label>

            {dimScheduleEnabled && (
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs text-neutral-400">Dim at</span>
                  <input
                    type="time"
                    value={dimStartTime}
                    onChange={(e) => onChange({ dimStartTime: e.target.value })}
                    className="mt-1 block w-full rounded-md bg-neutral-800 border border-neutral-600 text-sm text-neutral-200 px-3 py-2 focus:outline-none focus:border-blue-500"
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-neutral-400">Brighten at</span>
                  <input
                    type="time"
                    value={dimEndTime}
                    onChange={(e) => onChange({ dimEndTime: e.target.value })}
                    className="mt-1 block w-full rounded-md bg-neutral-800 border border-neutral-600 text-sm text-neutral-200 px-3 py-2 focus:outline-none focus:border-blue-500"
                  />
                </label>
                <p className="col-span-2 text-xs text-neutral-500">
                  Dims the display during this window and automatically brightens when it ends. Supports overnight spans.
                </p>
              </div>
            )}

            <label className="flex items-center gap-2 cursor-pointer mt-2">
              <input
                type="checkbox"
                checked={sleepScheduleEnabled}
                onChange={(e) => onChange({ sleepScheduleEnabled: e.target.checked })}
                className="rounded border-neutral-600 bg-neutral-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
              />
              <span className="text-sm text-neutral-200">Sleep on a schedule</span>
            </label>

            {sleepScheduleEnabled && (
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs text-neutral-400">Sleep at</span>
                  <input
                    type="time"
                    value={sleepStartTime}
                    onChange={(e) => onChange({ sleepStartTime: e.target.value })}
                    className="mt-1 block w-full rounded-md bg-neutral-800 border border-neutral-600 text-sm text-neutral-200 px-3 py-2 focus:outline-none focus:border-blue-500"
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-neutral-400">Wake at</span>
                  <input
                    type="time"
                    value={sleepEndTime}
                    onChange={(e) => onChange({ sleepEndTime: e.target.value })}
                    className="mt-1 block w-full rounded-md bg-neutral-800 border border-neutral-600 text-sm text-neutral-200 px-3 py-2 focus:outline-none focus:border-blue-500"
                  />
                </label>
                <p className="col-span-2 text-xs text-neutral-500">
                  Forces the display fully off during this window and automatically wakes when it ends. Ignores activity. Supports overnight spans.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
