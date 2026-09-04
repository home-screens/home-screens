'use client';

import { useRef, useCallback, useEffect } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import { useTranslate } from '@/i18n';
import { useDisplayTarget } from '../display-target';
import { usePendingCommand } from '../hooks';
import { CONFIRM_TIMEOUT_MS } from '@/lib/display-liveness';

interface BrightnessCardProps {
  /**
   * Brightness each online target display last reported. The slider seeds
   * from these instead of assuming 100%: reopening the remote after setting
   * 40% must show 40%, and a "little nudge" must not jump the wall to 95%.
   */
  reportedValues: number[];
  /** No online display to talk to. */
  disabled: boolean;
  /** Fires after a value is sent, so the parent can speed up its status polls. */
  onSent: () => void;
  /** Called when the display never confirms the value (name of the target for the message). */
  onNoConfirm: (value: number) => void;
}

export default function BrightnessCard({ reportedValues, disabled, onSent, onNoConfirm }: BrightnessCardProps) {
  const t = useTranslate('remote');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const { target } = useDisplayTarget();
  const pending = usePendingCommand<number>(CONFIRM_TIMEOUT_MS, onNoConfirm);

  useEffect(() => () => clearTimeout(debounceRef.current), []);

  // One agreed value across the targets, or unknown. In All mode two
  // displays at different levels read as "--" rather than either number.
  const reported = reportedValues.length > 0 && reportedValues.every((v) => v === reportedValues[0])
    ? reportedValues[0]
    : null;

  // Settle the pending value once every target reports it.
  const { expected, settle } = pending;
  useEffect(() => {
    if (expected === null) return;
    if (reportedValues.length > 0 && reportedValues.every((v) => v === expected)) settle();
  }, [reportedValues, expected, settle]);

  const shown = expected ?? reported;
  const known = shown !== null;
  // The track is drawn from `shown`; with nothing known it sits at 100 so
  // the first drag starts from "fully lit", the safest guess.
  const sliderValue = shown ?? 100;

  const sendBrightness = useCallback((value: number) => {
    pending.start(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      editorFetch('/api/display/brightness', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value, ...(target ? { displayId: target } : {}) }),
      }).catch(() => {});
      onSent();
    }, 300);
  }, [target, pending, onSent]);

  return (
    <div className={`mx-5 mt-4 p-4 bg-hs-card border border-hs-border rounded-[14px] ${disabled ? 'opacity-40' : ''}`}>
      <div className="flex items-center justify-between mb-3.5">
        <div className="flex items-center gap-2 text-sm font-semibold text-hs-text-primary">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-[18px] h-[18px] text-hs-warning">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
          </svg>
          {t('brightnessCard.label')}
        </div>
        <span
          data-testid="brightness-value"
          className={`text-sm font-semibold tabular-nums ${expected !== null ? 'text-hs-text-faint animate-pulse' : 'text-hs-text-muted'}`}
        >
          {known ? `${shown}%` : '--'}
        </span>
      </div>

      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={sliderValue}
        disabled={disabled}
        onChange={(e) => sendBrightness(Number(e.target.value))}
        className="w-full h-2 rounded-full appearance-none cursor-pointer disabled:cursor-default
          [&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-hs-border-strong
          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-[22px] [&::-webkit-slider-thumb]:h-[22px] [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0_2px_8px_rgba(0,0,0,0.3)] [&::-webkit-slider-thumb]:-mt-[7px]
          [&::-moz-range-track]:h-2 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-hs-border-strong
          [&::-moz-range-thumb]:w-[22px] [&::-moz-range-thumb]:h-[22px] [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:shadow-[0_2px_8px_rgba(0,0,0,0.3)]"
        style={{
          background: known
            ? `linear-gradient(to right, #f59e0b ${sliderValue}%, var(--hs-border-strong) ${sliderValue}%)`
            : 'var(--hs-border-strong)',
        }}
        aria-label={known ? t('brightnessCard.valueAriaLabel', { percent: shown }) : t('brightnessCard.unknownAriaLabel')}
      />
    </div>
  );
}
