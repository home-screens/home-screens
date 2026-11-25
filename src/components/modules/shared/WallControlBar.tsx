'use client';

import { Children, createContext, useContext, type CSSProperties, type ReactNode } from 'react';
import { WALL_BUTTON_CLASS, wallPress } from './wallPress';
import { HoldConfirmButton } from './HoldConfirmButton';

/**
 * The bar of big buttons a finger brings up over something that fills the
 * wall (a running timer today; a slideshow or a video next): a frosted pill
 * at the bottom, where a child can reach, with a soft shade behind it so it
 * reads on any picture. Pair it with `useTouchReveal`, which decides when it
 * is up. Sizes are authored on the 1080 by 1920 portrait canvas and scaled by
 * `unit`, the way the full-screen views and timer screens are.
 */

export type WallControlTone = 'dark' | 'light';
/** The shade behind the bar: dark for dark pictures, light for light ones, warm for a bright colour that a grey shade would muddy. */
export type WallControlShade = 'dark' | 'light' | 'warm' | 'none';

interface Tone {
  bar: string;
  barBorder: string;
  shadow: string;
  button: string;
  buttonBorder: string;
  ink: string;
  label: string;
}

const TONES: Record<WallControlTone, Tone> = {
  dark: {
    // Nearly solid: on a bright look (Color fall) words behind the bar would show between the buttons.
    bar: 'rgba(10,15,22,0.92)',
    barBorder: 'rgba(255,255,255,0.12)',
    shadow: '0 24px 60px rgba(0,0,0,0.45), inset 0 2px 0 rgba(255,255,255,0.06)',
    button: 'rgba(255,255,255,0.08)',
    buttonBorder: 'rgba(255,255,255,0.10)',
    ink: '#ffffff',
    label: 'rgba(255,255,255,0.78)',
  },
  light: {
    bar: 'rgba(255,255,255,0.86)',
    barBorder: 'rgba(0,0,0,0.07)',
    shadow: '0 24px 60px rgba(80,60,30,0.18)',
    button: 'rgba(0,0,0,0.045)',
    buttonBorder: 'rgba(0,0,0,0.06)',
    ink: '#22262e',
    label: '#6b6257',
  },
};

const SHADES: Record<Exclude<WallControlShade, 'none'>, string> = {
  dark: 'linear-gradient(to top, rgba(6,9,14,0.97) 0%, rgba(6,9,14,0.94) 54%, rgba(6,9,14,0.55) 76%, rgba(6,9,14,0) 100%)',
  light: 'linear-gradient(to top, rgba(240,234,224,0.97) 0%, rgba(240,234,224,0.9) 40%, rgba(240,234,224,0) 100%)',
  warm: 'linear-gradient(to top, rgba(120,32,14,0.72) 0%, rgba(120,32,14,0.5) 40%, rgba(120,32,14,0) 100%)',
};

/** The button that carries on (Resume): the "Done!" green every timer look already uses. */
const PRIMARY = { fill: '#34d399', ink: '#06281c', glow: 'rgba(52,211,153,0.35)' };

/** A button's size on the 1080 by 1920 canvas. */
export const WALL_CONTROL_BUTTON_PX = { w: 232, h: 172 };

interface BarContext {
  unit: number;
  tone: Tone;
  /** The bar carries a word over its buttons. */
  labelled: boolean;
  /** The buttons just moved: none takes a tap for a moment. */
  settling: boolean;
}

const BarCtx = createContext<BarContext>({ unit: 1, tone: TONES.dark, labelled: false, settling: false });

export interface WallControlBarProps {
  /** Canvas pixels to this screen's pixels. */
  unit: number;
  tone?: WallControlTone;
  shade?: WallControlShade;
  /** How far up the shade reaches, canvas pixels; short over a light picture whose words sit low. */
  shadeHeight?: number;
  /**
   * The width the bar may take, in this screen's pixels (the wall's own
   * width). Given, a bar with more buttons than fit is drawn smaller so every
   * button stays on the screen; left out, the buttons keep their full size.
   */
  maxWidth?: number;
  /** A word over the buttons that says what state things are in ("Paused"). */
  label?: string;
  /**
   * The bar's buttons just changed under a finger (one came or went and the
   * bar re-centred): for that moment no button takes a tap, so a tap aimed at
   * the one that went does not land on whichever slid into its place. They
   * keep their look; a flash of dimmed buttons would read as broken. A held
   * button (Stop) is left alone, since a tap cannot set it off.
   */
  settling?: boolean;
  ariaLabel: string;
  testId?: string;
  children: ReactNode;
}

/** Room kept clear between the bar and each edge of the wall, canvas pixels. */
const BAR_SIDE_MARGIN_PX = 20;

/**
 * How much a bar of `count` buttons has to shrink to fit `maxWidth` screen
 * pixels at `unit`: 1 when it fits, less when it does not. Five buttons are
 * wider than a portrait wall at full size, six by half as much again.
 */
export function wallControlBarFit(count: number, unit: number, maxWidth?: number): number {
  if (!maxWidth || maxWidth <= 0 || unit <= 0 || count <= 0) return 1;
  const natural = (count * WALL_CONTROL_BUTTON_PX.w + (count - 1) * 20 + 2 * 20 + 2 * 2) * unit;
  const room = maxWidth - 2 * BAR_SIDE_MARGIN_PX * unit;
  return Math.min(1, room / natural);
}

export function WallControlBar({
  unit: canvasUnit, tone = 'dark', shade = 'dark', shadeHeight = 760, maxWidth, label, settling = false, ariaLabel, testId, children,
}: WallControlBarProps) {
  const T = TONES[tone];
  // Everything in the bar is drawn at one size, so shrinking the unit shrinks
  // buttons, gaps, type and the pill together.
  const unit = canvasUnit * wallControlBarFit(Children.toArray(children).length, canvasUnit, maxWidth);
  return (
    <>
      {shade !== 'none' && (
        <div
          aria-hidden="true"
          className="wall-control-shade"
          style={{
            position: 'absolute', left: 0, right: 0, bottom: 0, height: shadeHeight * canvasUnit,
            background: SHADES[shade], pointerEvents: 'none',
          }}
        />
      )}
      <div
        role="toolbar"
        aria-label={ariaLabel}
        data-testid={testId}
        className="wall-control-bar"
        style={{
          position: 'absolute', left: '50%', bottom: 72 * canvasUnit, transform: 'translateX(-50%)',
          display: 'flex', gap: 20 * unit,
          padding: `${(label ? 70 : 20) * unit}px ${20 * unit}px ${20 * unit}px`,
          borderRadius: 66 * unit, background: T.bar, border: `${2 * unit}px solid ${T.barBorder}`,
          boxShadow: T.shadow,
        }}
      >
        {label && (
          <div
            style={{
              position: 'absolute', top: 18 * unit, left: 0, right: 0, textAlign: 'center',
              fontSize: 32 * unit, fontWeight: 750, letterSpacing: '0.2em', textTransform: 'uppercase',
              color: T.label, pointerEvents: 'none',
            }}
          >
            {label}
          </div>
        )}
        <BarCtx.Provider value={{ unit, tone: T, labelled: !!label, settling }}>{children}</BarCtx.Provider>
      </div>
    </>
  );
}

function buttonStyle(unit: number, tone: Tone, primary: boolean): CSSProperties {
  return {
    position: 'relative',
    width: WALL_CONTROL_BUTTON_PX.w * unit,
    height: WALL_CONTROL_BUTTON_PX.h * unit,
    flexShrink: 0,
    borderRadius: 46 * unit,
    borderStyle: 'solid',
    borderWidth: 2 * unit,
    borderColor: primary ? PRIMARY.fill : tone.buttonBorder,
    background: primary ? PRIMARY.fill : tone.button,
    color: primary ? PRIMARY.ink : tone.ink,
    boxShadow: primary ? `0 0 ${44 * unit}px ${PRIMARY.glow}` : undefined,
    fontFamily: 'inherit',
    fontSize: 36 * unit,
    fontWeight: 650,
    letterSpacing: '-0.01em',
    lineHeight: 1.1,
    padding: 0,
    cursor: 'pointer',
  };
}

function ButtonFace({ icon, label, sub, unit }: { icon: ReactNode; label: string; sub?: string; unit: number }) {
  const line: CSSProperties = { maxWidth: '92%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
  return (
    <>
      <span
        aria-hidden="true"
        className="flex items-center justify-center [&>svg]:h-full [&>svg]:w-full"
        style={{ width: 64 * unit, height: 64 * unit }}
      >
        {icon}
      </span>
      <span style={line}>{label}</span>
      {sub && <span style={{ ...line, marginTop: -8 * unit, fontSize: 24 * unit, fontWeight: 550, opacity: 0.6 }}>{sub}</span>}
    </>
  );
}

const FACE_CLASS = 'flex flex-col items-center justify-center';

export interface WallControlButtonProps {
  icon: ReactNode;
  label: string;
  onPress: () => void;
  /** The one that carries on (Resume), filled in green. */
  primary?: boolean;
  testId?: string;
}

/**
 * One button of the bar: an icon with its word under it, pressed the moment
 * a finger lands. A button the bar has no use for right now is left out
 * rather than dimmed: from across the room a dimmed one reads as broken.
 */
export function WallControlButton({ icon, label, onPress, primary = false, testId }: WallControlButtonProps) {
  const { unit, tone, settling } = useContext(BarCtx);
  return (
    <button
      type="button"
      // While the bar settles there is no press feedback, but FACE_CLASS
      // stays: that class carries the centring, so spreading nothing left
      // the icon and its word laid out as a plain button's content instead
      // of stacked and centred.
      {...(settling ? { className: FACE_CLASS } : wallPress(FACE_CLASS))}
      data-testid={testId}
      disabled={settling}
      onClick={settling ? undefined : onPress}
      style={{ ...buttonStyle(unit, tone, primary), gap: 12 * unit }}
    >
      <ButtonFace icon={icon} label={label} unit={unit} />
    </button>
  );
}

export interface WallControlHoldButtonProps {
  icon: ReactNode;
  label: string;
  onConfirm: () => void;
  /** Spoken name, which says it has to be held ("Stop (hold to confirm)"). */
  ariaLabel: string;
  /** Flashed after a tap that let go too soon ("Keep holding to stop"). */
  hint: string;
  /** A small word under the label that says it has to be held ("hold"), as Sleep's buttons do. */
  sub?: string;
  testId?: string;
}

/** A button of the bar that has to be held for a second (Stop), with the red sweep and hint of every hold on the wall. */
export function WallControlHoldButton({ icon, label, onConfirm, ariaLabel, hint, sub, testId }: WallControlHoldButtonProps) {
  const { unit, tone, labelled } = useContext(BarCtx);
  return (
    <span data-testid={testId} style={{ display: 'contents' }}>
      <HoldConfirmButton
        onConfirm={onConfirm}
        ariaLabel={ariaLabel}
        hint={hint}
        hintFontSize={30 * unit}
        hintPlacement="above"
        // The held button closes the row, and its hint is wider than it is.
        hintAlign="end"
        // Over the whole bar when it carries a word ("Paused"), so the hint never covers it.
        hintGap={(labelled ? 82 : 18) * unit}
        className={WALL_BUTTON_CLASS}
        contentClassName="flex h-full w-full items-center justify-center"
        style={buttonStyle(unit, tone, false)}
        holdingStyle={{ borderColor: '#f87171' }}
      >
        {/* The full button's width, so the word gets the same room as on the other buttons. */}
        <span className={FACE_CLASS} style={{ gap: 12 * unit, width: '100%', height: '100%' }}>
          <ButtonFace icon={icon} label={label} sub={sub} unit={unit} />
        </span>
      </HoldConfirmButton>
    </span>
  );
}
