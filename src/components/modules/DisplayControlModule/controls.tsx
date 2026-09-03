'use client';

import { useState, type CSSProperties } from 'react';
import { useTranslate } from '@/i18n';
import type { ControlMetrics } from './metrics';

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
export const UpIcon = ({ size = 36 }: { size?: number }) => (
  <svg {...iconProps(size)}><path d="M5 15l7-7 7 7" /></svg>
);
export const DownIcon = ({ size = 36 }: { size?: number }) => (
  <svg {...iconProps(size)}><path d="M19 9l-7 7-7-7" /></svg>
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

export type ControlIconName = 'prev' | 'next' | 'up' | 'down' | 'sleep' | 'wake' | 'brightness';

const ICONS: Record<ControlIconName, (p: { size?: number }) => React.ReactElement> = {
  prev: PrevIcon,
  next: NextIcon,
  up: UpIcon,
  down: DownIcon,
  sleep: SleepIcon,
  wake: WakeIcon,
  brightness: BrightnessIcon,
};

/** An icon at whatever size the box allows. */
export function ControlIcon({ name, m }: { name: ControlIconName; m: ControlMetrics }) {
  const Icon = ICONS[name];
  return <Icon size={m.icon} />;
}

export const BUTTON_CLASS =
  'bg-hs-card border border-hs-border-strong text-hs-text-primary transition-transform active:scale-95 min-h-0 min-w-0 overflow-hidden';

/** Box styling one button takes from the sizing model. The icon-to-words
 *  spacing is a margin on the words themselves, not a flex gap, so an
 *  icons-only button stays perfectly centred. */
export function buttonStyle(m: ControlMetrics) {
  return { borderRadius: m.radius };
}

/**
 * Word + icon button. `row` lays the words beside the icon (bar layout),
 * otherwise under it. The words drop out when the button is too small for
 * them, or when the user chose icons-only.
 */
export function ControlButton({
  label,
  sub,
  icon,
  m,
  onClick,
  row = false,
  ariaLabel,
  className = '',
  style,
}: {
  label: string;
  sub?: string;
  icon: ControlIconName;
  m: ControlMetrics;
  onClick: () => void;
  row?: boolean;
  ariaLabel?: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel ?? label}
      onClick={onClick}
      style={{ ...buttonStyle(m), ...style }}
      className={`${BUTTON_CLASS} ${row ? 'flex flex-row items-center justify-center' : 'flex flex-col items-center justify-center'} ${className}`}
    >
      <ControlIcon name={icon} m={m} />
      <ButtonWords label={label} sub={sub} m={m} row={row} />
    </button>
  );
}

/** The words of a control, sized from the button they sit in. */
export function ButtonWords({
  label,
  sub,
  m,
  row = false,
}: {
  label: string;
  sub?: string;
  m: ControlMetrics;
  row?: boolean;
}) {
  if (!m.showWords) return null;
  const words = (
    <>
      <span className="font-semibold whitespace-nowrap" style={{ fontSize: m.label }}>{label}</span>
      {sub && m.sub > 0 && (
        <span className="font-normal whitespace-nowrap text-hs-text-muted" style={{ fontSize: m.sub }}>{sub}</span>
      )}
    </>
  );
  return (
    <span
      className={`flex min-w-0 flex-col leading-tight ${row ? 'items-start' : 'items-center'}`}
      style={{
        marginLeft: row ? Math.max(4, m.icon * 0.3) : undefined,
        marginTop: row ? undefined : Math.max(2, m.label * 0.2),
      }}
    >
      {words}
    </span>
  );
}

const TRACK_CLASS =
  'relative z-10 w-full rounded-full appearance-none cursor-pointer bg-transparent ' +
  '[&::-webkit-slider-runnable-track]:h-[var(--dc-track)] [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-transparent ' +
  '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-[var(--dc-thumb)] [&::-webkit-slider-thumb]:h-[var(--dc-thumb)] [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-hs-accent [&::-webkit-slider-thumb]:shadow-[0_0_0_4px_rgba(0,0,0,0.6)] [&::-webkit-slider-thumb]:mt-[calc((var(--dc-track)-var(--dc-thumb))/2)] ' +
  '[&::-moz-range-track]:h-[var(--dc-track)] [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-transparent ' +
  '[&::-moz-range-thumb]:w-[var(--dc-thumb)] [&::-moz-range-thumb]:h-[var(--dc-thumb)] [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-hs-accent [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:shadow-[0_0_0_4px_rgba(0,0,0,0.6)]';

/**
 * Brightness row: the reported percentage (a dash until the target has
 * reported, or while targets disagree) and a slider whose track is only
 * painted once the value is known. Dragging shows the draft value; the value
 * is sent once on release. With no room for the caption a sun glyph beside the
 * track says what the bare bar does.
 */
export function BrightnessSlider({
  value,
  onCommit,
  m,
  className = '',
}: {
  value: number | null;
  onCommit: (v: number) => void;
  m: ControlMetrics;
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

  const thumb = Math.max(12, m.thumb || 26);
  const track = Math.max(4, m.track || 9);

  return (
    <div className={`flex flex-col justify-center ${className}`} style={{ gap: m.gap * 0.5 }}>
      {m.showCaption && (
        <div
          className="flex items-center justify-between uppercase tracking-wider text-hs-text-muted"
          style={{ fontSize: m.caption }}
        >
          <span>{t('display-control.brightness')}</span>
          <span data-testid="display-control-brightness" className="font-semibold tabular-nums text-hs-text-primary">
            {known ? `${shown}%` : '–'}
          </span>
        </div>
      )}
      <div className="flex items-center" style={{ gap: m.gap * 0.6 }}>
        {!m.showCaption && (
          <span className="flex shrink-0 text-hs-text-muted" aria-hidden="true">
            <BrightnessIcon size={Math.min(20, Math.max(12, thumb * 0.8))} />
          </span>
        )}
        {!m.showCaption && (
          <span data-testid="display-control-brightness" className="sr-only">
            {known ? `${shown}%` : '–'}
          </span>
        )}
        {/* The painted track is a sibling, not the input's own background, so
            it keeps its rounded ends however tall the thumb makes the input. */}
        <div className="relative flex min-w-0 flex-1 items-center" style={{ height: Math.max(thumb, track) }}>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 rounded-full"
            style={{
              height: track,
              background: known
                ? `linear-gradient(to right, var(--hs-accent) ${sliderValue}%, var(--hs-border-strong) ${sliderValue}%)`
                : 'var(--hs-border-strong)',
            }}
          />
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
              ['--dc-thumb' as string]: `${thumb}px`,
              ['--dc-track' as string]: `${track}px`,
              height: Math.max(thumb, track),
            }}
          />
        </div>
      </div>
    </div>
  );
}
