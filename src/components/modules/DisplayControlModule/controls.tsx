'use client';

import { useState, type ReactNode } from 'react';
import { useTranslate } from '@/i18n';

// Icons shared by every layout. `size` is the rendered box in px.
const iconProps = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
});

export const PrevIcon = ({ size = 36 }: { size?: number }) => (
  <svg {...iconProps(size)}><path d="M15 19l-7-7 7-7" /></svg>
);
export const NextIcon = ({ size = 36 }: { size?: number }) => (
  <svg {...iconProps(size)}><path d="M9 5l7 7-7 7" /></svg>
);
export const SleepIcon = ({ size = 36 }: { size?: number }) => (
  <svg {...iconProps(size)}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
);
export const WakeIcon = ({ size = 36 }: { size?: number }) => (
  <svg {...iconProps(size)}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
  </svg>
);
export const BrightnessIcon = ({ size = 36 }: { size?: number }) => (
  <svg {...iconProps(size)}>
    <circle cx="12" cy="12" r="5" />
    <path d="M12 1v3M12 20v3M1 12h3M20 12h3" />
  </svg>
);

export const BUTTON_CLASS =
  'rounded-[18px] bg-hs-card border border-hs-border-strong text-hs-text-primary transition-transform active:scale-95 min-h-0 min-w-0';

/**
 * Word + icon button. `row` lays the words beside the icon (bar layout),
 * otherwise under it. `compact` drops the words and keeps the aria-label.
 */
export function ControlButton({
  label,
  sub,
  icon,
  onClick,
  compact,
  row = false,
  ariaLabel,
  className = '',
}: {
  label: string;
  sub?: string;
  icon: ReactNode;
  onClick: () => void;
  compact: boolean;
  row?: boolean;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel ?? label}
      onClick={onClick}
      className={`${BUTTON_CLASS} ${row ? 'flex flex-row items-center justify-center gap-3' : 'flex flex-col items-center justify-center gap-2'} ${className}`}
    >
      {icon}
      {!compact && <ButtonWords label={label} sub={sub} row={row} />}
    </button>
  );
}

/** The words of a control: label at 24px (22px in a row), sub-label at 20px. */
export function ButtonWords({ label, sub, row = false }: { label: string; sub?: string; row?: boolean }) {
  if (row) {
    return (
      <span className="flex items-baseline gap-2 leading-tight">
        <span className="text-[22px] font-semibold">{label}</span>
        {sub && <span className="text-[20px] font-normal text-hs-text-muted">{sub}</span>}
      </span>
    );
  }
  return (
    <>
      <span className="text-[24px] font-semibold leading-tight">{label}</span>
      {sub && <span className="text-[20px] font-normal leading-tight text-hs-text-muted">{sub}</span>}
    </>
  );
}

const TRACK_CLASS =
  'w-full h-2.5 rounded-full appearance-none cursor-pointer ' +
  '[&::-webkit-slider-runnable-track]:h-2.5 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-transparent ' +
  '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-[30px] [&::-webkit-slider-thumb]:h-[30px] [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-hs-accent [&::-webkit-slider-thumb]:shadow-[0_0_0_4px_rgba(0,0,0,0.6)] [&::-webkit-slider-thumb]:-mt-[10px] ' +
  '[&::-moz-range-track]:h-2.5 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-transparent ' +
  '[&::-moz-range-thumb]:w-[30px] [&::-moz-range-thumb]:h-[30px] [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-hs-accent [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:shadow-[0_0_0_4px_rgba(0,0,0,0.6)]';

/**
 * Brightness row: label, the reported percentage (a dash until the target has
 * reported, or while targets disagree) and a slider whose track is only
 * painted once the value is known. Dragging shows the draft value; the value
 * is sent once on release.
 */
export function BrightnessSlider({
  value,
  onCommit,
  className = '',
}: {
  value: number | null;
  onCommit: (v: number) => void;
  className?: string;
}) {
  const t = useTranslate('modules');
  const [draft, setDraft] = useState<number | null>(null);
  const shown = draft ?? value;
  const known = shown !== null;
  // With nothing known the thumb sits at full brightness, the safest place
  // to start a drag from.
  const sliderValue = shown ?? 100;

  const commit = () => {
    if (draft === null) return;
    onCommit(draft);
    setDraft(null);
  };

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      <div className="flex items-center justify-between text-[20px] uppercase tracking-wider text-hs-text-muted">
        <span>{t('display-control.brightness')}</span>
        <span data-testid="display-control-brightness" className="font-semibold tabular-nums text-hs-text-primary">
          {known ? `${shown}%` : '–'}
        </span>
      </div>
      <input
        aria-label={known ? t('display-control.brightnessValue', { percent: shown }) : t('display-control.brightnessUnknown')}
        type="range"
        min={0}
        max={100}
        value={sliderValue}
        onChange={(e) => setDraft(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        className={TRACK_CLASS}
        style={{
          background: known
            ? `linear-gradient(to right, var(--hs-accent) ${sliderValue}%, var(--hs-border-strong) ${sliderValue}%)`
            : 'var(--hs-border-strong)',
        }}
      />
    </div>
  );
}
