'use client';

import { useEffect, type CSSProperties, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useTranslate } from '@/i18n';
import ModalPortal from '@/components/ui/ModalPortal';
import { useSheetDialog } from '@/hooks/useSheetDialog';
import { useSettledTap, useSheetTapGuard } from '@/hooks/useSheetTapGuard';
import { useBackGesture } from '../hooks/useBackGesture';
import { holdToastAtTop } from '../remote-toast';
import { REMOTE_LAYERS, type RemoteLayer } from './remote-layers';

export interface SheetFrameProps {
  /** Its rung on the phone's layer scale. */
  layer: RemoteLayer;
  /** What a screen reader calls the sheet. */
  label: string;
  /**
   * How it closes: Escape, the Back gesture, the dimmed area and the close
   * control all come here. Leave out while it must not close (busy keeping
   * something): Back then stays on the sheet and the close control is off.
   */
  onClose?: () => void;
  /** False for a sheet whose only way out is a button, where a tap on the dimmed page does nothing. */
  closeOnBackdrop?: boolean;
  /**
   * False for a sheet that leaves the page under it live (the grown-up's
   * "all done" card): nothing is dimmed, and a tap beside the panel reaches
   * the page rather than closing the sheet.
   */
  dim?: boolean;
  /** A tap on the dimmed area this soon after it opens is ignored: the second half of the tap that opened it. */
  settleMs?: number;
  /** When it closes from a tap, a second tap near there is ignored for a moment (see `BottomSheet`). */
  guardTaps?: boolean;
  /** Where focus lands as it opens; see `useFocusTrap`. */
  focus?: 'container' | 'field';
  /** For a sheet that stays mounted and slides: whether it is up. Leave out for one mounted to be shown. */
  open?: boolean;
  /** Up, but under a full-screen page opened from it. */
  covered?: boolean;
  /** Drawn at the end of the page, out of whatever opened it (see `ModalPortal`). */
  portal?: boolean;
  /** The grab handle across the top. */
  handle?: boolean;
  /** The title row. Leave out for a sheet that draws its own heading (a question, the code pad). */
  title?: ReactNode;
  /** A small line under the title. */
  subtitle?: ReactNode;
  /** Small text on the right of the title row: a character count, a time left. */
  titleAside?: ReactNode;
  /** Where the title row sits: its own padding and a rule under it on a sheet whose panel has no padding. */
  titleRowStyle?: CSSProperties;
  /** The title row's close control. Off for a sheet whose way out is its own Cancel. */
  closeControl?: boolean;
  /** What a screen reader calls the close control; "Close" unless the sheet names it. */
  closeLabel?: string;
  testId?: string;
  /** The panel's own look: background, corners, padding (the bottom is `bottomGap`), height, scrolling. */
  panelStyle?: CSSProperties;
  /** A class on the panel, for a CSS entrance that stands down for reduced motion (`hs-pop-in`). */
  panelClassName?: string;
  /** The least room under the content; the frame grows it to clear the iPhone home bar. */
  bottomGap?: number;
  children: ReactNode;
}

const PANEL_SHADOW = '0 -8px 40px rgba(0,0,0,0.5)';

/**
 * The frame every phone sheet is drawn in, so they agree on what a sheet is:
 * the dimmed page behind, a column no wider than the page (640), room under
 * the last button for the home bar, a real modal dialog (focus in, Tab kept
 * in, Escape, focus back after), the Back gesture closing it instead of
 * leaving the remote, its rung on the layer scale, and one title row with one
 * way out: a 44px close control.
 *
 * The shells draw through it (`BottomSheet`, `TallSheet`, `SlideUpSheet`,
 * `ConfirmSheet`, the grown-up code pad, the custom icon sheets); a tab or a
 * form draws one of those, not this.
 */
export default function SheetFrame({ portal = false, ...props }: SheetFrameProps) {
  if (!portal) return <Frame {...props} />;
  // The panel reaches the page a beat after the sheet mounts, so the dialog
  // hooks live in here with it, not up in the sheet.
  return (
    <ModalPortal>
      <Frame {...props} />
    </ModalPortal>
  );
}

function Frame({
  layer,
  label,
  onClose,
  closeOnBackdrop = true,
  dim = true,
  settleMs = 0,
  guardTaps = false,
  focus = 'container',
  open,
  covered = false,
  handle = false,
  title,
  subtitle,
  titleAside,
  titleRowStyle,
  closeControl = true,
  closeLabel,
  testId,
  panelStyle,
  panelClassName,
  bottomGap = 0,
  children,
}: Omit<SheetFrameProps, 'portal'>) {
  const tCore = useTranslate('core');
  const slides = open !== undefined;
  const up = open ?? true;
  const shown = up && !covered;
  useSheetTapGuard(guardTaps);
  const dialog = useSheetDialog<HTMLDivElement>({ onClose, focus, active: shown, keepAutoFocus: true });
  const settled = useSettledTap(settleMs);
  // Back is the sheet's way out, exactly as its close control. Under a page
  // opened from it, the page's own entry is on top, so Back closes that first.
  useBackGesture(() => {
    if (!onClose) return true;
    onClose();
    return false;
  }, { active: up });
  // A toast above the tab bar would sit on this sheet's lower rows and take
  // their taps, so it waits at the top while the sheet is up. A sheet that
  // leaves the page live is small and leaves the toast where the page has it.
  const holdsToast = shown && dim;
  useEffect(() => (holdsToast ? holdToastAtTop() : undefined), [holdsToast]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: REMOTE_LAYERS[layer],
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        alignItems: 'center',
        pointerEvents: up && dim ? 'auto' : 'none',
      }}
    >
      {dim && (
        <div
          aria-hidden="true"
          data-testid="sheet-backdrop"
          onClick={closeOnBackdrop && onClose ? settled(onClose) : undefined}
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            ...(slides ? { opacity: up ? 1 : 0, transition: 'opacity 0.3s' } : {}),
          }}
        />
      )}
      <div
        {...dialog}
        aria-label={label}
        data-testid={testId}
        className={panelClassName}
        // Slid away, it is still "in the page" to assistive tech, so it is
        // taken out of the tree while closed or covered.
        aria-hidden={slides ? !shown : undefined}
        inert={slides ? !shown : undefined}
        onClick={(event) => event.stopPropagation()}
        style={{
          outline: 'none',
          position: 'relative',
          // Same cap as the rest of the remote, so on a tablet the sheet sits
          // over the column it belongs to.
          width: '100%',
          maxWidth: 640,
          boxShadow: PANEL_SHADOW,
          ...(dim ? {} : { pointerEvents: up ? 'auto' : 'none' }),
          ...(slides
            ? { transform: up ? 'translateY(0)' : 'translateY(100%)', transition: 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)' }
            : {}),
          ...panelStyle,
          paddingBottom: `max(${bottomGap}px, env(safe-area-inset-bottom, 0px))`,
        }}
      >
        {handle && <GrabHandle />}
        {title !== undefined && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 'none', marginBottom: 14, ...titleRowStyle }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, lineHeight: '24px', color: 'var(--hs-text-primary)' }}>{title}</h2>
              {subtitle !== undefined && (
                <div style={{ fontSize: 12, lineHeight: '18px', marginTop: 2, color: 'var(--hs-text-faint)' }}>{subtitle}</div>
              )}
            </div>
            {titleAside !== undefined && (
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--hs-text-faint)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                {titleAside}
              </span>
            )}
            {/* Tapping the dimmed area closes too, but kids and grandparents look for a way out. */}
            {closeControl && (
              <button
                type="button"
                className="press-btn"
                onClick={onClose}
                disabled={!onClose}
                aria-label={closeLabel ?? tCore('actions.close')}
                data-testid="sheet-close"
                style={{
                  flex: 'none',
                  width: 44,
                  height: 44,
                  margin: '-10px -10px -10px 0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 12,
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--hs-text-faint)',
                  cursor: onClose ? 'pointer' : 'default',
                  opacity: onClose ? 1 : 0.4,
                }}
              >
                <X size={20} aria-hidden="true" />
              </button>
            )}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

/** The one grab handle a phone sheet draws: a hint that it came up from the bottom. */
function GrabHandle() {
  return (
    <div aria-hidden="true" style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 6px', flex: 'none' }}>
      <div style={{ width: 36, height: 5, borderRadius: 3, background: 'var(--hs-border-strong)' }} />
    </div>
  );
}
