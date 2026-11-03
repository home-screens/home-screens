'use client';

import type { CSSProperties, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useInteractionHold } from '@/lib/interaction-hold';
import { useSettledTap } from '@/hooks/useSheetTapGuard';
import { DISPLAY_LAYERS } from '@/lib/display-layers';
import type { FullscreenThemeTokens } from '@/lib/fullscreen-themes';
import type { EventTapStyle } from '@/types/config';
import { useAutoClose } from './useAutoClose';

export interface WallOverlayProps {
  /** What the dialog is called (the event, the meal, the day). */
  label: string;
  onClose: () => void;
  /** How long it stays with nobody touching it; every touch starts the wait over. */
  autoCloseMs: number;
  /** Something is open on top (an event's detail, a recipe card): the wait stops until it closes. */
  paused?: boolean;
  /** Starts the wait over when it changes (a new recipe on the same card). */
  restartKey?: string | number | boolean | null;
  /** A tap on the scrim closes. Off for a surface that fills the screen with controls of its own. */
  closeOnScrim?: boolean;
  /** The scrim's colour. */
  scrim?: string;
  testId?: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

/**
 * The frame every sheet and card over the wall shares. It portals to the
 * body, so it escapes the screen's own zoom (which is why what it holds is
 * sized from the window, not in the module's pixels), sits below the sleep
 * and alert overlays so those still take the screen, holds rotation and
 * flick navigation while open, and closes itself after `autoCloseMs` with
 * nobody touching it, so a kiosk nobody stands at never shows a sheet
 * forever. A tap on the scrim closes it, except within a double tap of
 * opening: the second tap of a double tap on what opened the sheet lands on
 * the scrim, and must not close what it just opened.
 *
 * No `data-swipe-ignore`: flick navigation is already off while the overlay
 * holds the screen, and the attribute's stylesheet side effect would allow
 * pinch and double-tap zoom over the overlay on a real touchscreen.
 */
export function WallOverlay({
  label, onClose, autoCloseMs, paused = false, restartKey, closeOnScrim = true, scrim = 'rgba(0,0,0,0.62)',
  testId, className, style, children,
}: WallOverlayProps) {
  useInteractionHold();
  const touched = useAutoClose(onClose, autoCloseMs, { restartKey, paused });
  const settled = useSettledTap();
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      role="dialog"
      aria-label={label}
      data-testid={testId}
      className={className ? `wall-overlay ${className}` : 'wall-overlay'}
      onClick={closeOnScrim ? settled(onClose) : undefined}
      onPointerDown={touched}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: DISPLAY_LAYERS.moduleOverlay,
        // A plain scrim, no backdrop blur: a full-screen blur over content that
        // repaints (the today pulse) re-blurs the whole surface every frame.
        background: scrim,
        cursor: closeOnScrim ? 'pointer' : undefined,
        animation: 'wall-scrim-in 200ms ease-out',
        ...style,
      }}
    >
      {children}
    </div>,
    document.body,
  );
}

interface WallSheetPanelProps {
  /** A sheet rising from the bottom, or a card in the middle. */
  variant: EventTapStyle;
  theme: FullscreenThemeTokens;
  children: ReactNode;
  /** The caller's own marks for its tests. */
  [attr: `data-${string}`]: string | undefined;
}

/**
 * The panel of the calendar's sheets (an event's detail, a day's events): a
 * scrolling surface in the theme at most 900 px wide, as a bottom sheet with
 * a grabber or a centred card, that rises or grows into place. Taps inside
 * it never reach the scrim.
 */
export function WallSheetPanel({ variant, theme, children, ...attrs }: WallSheetPanelProps) {
  const shape: CSSProperties = variant === 'sheet'
    ? {
        left: '50%',
        transform: 'translateX(-50%)',
        bottom: 0,
        width: 'min(100%, 900px)',
        borderRadius: 'min(36px, 5vmin) min(36px, 5vmin) 0 0',
        boxShadow: '0 -16px 60px rgba(0,0,0,0.35)',
        animation: 'wall-sheet-in 250ms ease-out',
      }
    : {
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        width: 'min(calc(100% - 10vmin), 900px)',
        borderRadius: 'min(28px, 4vmin)',
        boxShadow: '0 24px 80px rgba(0,0,0,0.35)',
        animation: 'wall-card-in 250ms ease-out',
      };
  return (
    <div
      {...attrs}
      className="wall-sheet-panel"
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        maxHeight: '88vh',
        overflowY: 'auto',
        overflowX: 'hidden',
        scrollbarWidth: 'none',
        background: theme.surface,
        cursor: 'default',
        ...shape,
      }}
    >
      {variant === 'sheet' && (
        <div style={{ padding: 'clamp(12px, 2vmin, 22px) 0 6px' }}>
          <div style={{ width: 'min(96px, 12vmin)', height: 10, borderRadius: 5, background: theme.border, margin: '0 auto' }} />
        </div>
      )}
      {children}
    </div>
  );
}
