'use client';

import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { useTranslate } from '@/i18n';
import type { FullscreenThemeTokens } from '@/lib/fullscreen-themes';
import { useWallOverlayScale } from './useWallOverlayScale';
import type { WallTyping } from './useWallTyping';
import { WALL_KEYBOARD_IDLE_MS, WallKeyboard } from './WallKeyboard';
import { WallOverlay, WallSheetPanel } from './WallOverlay';
import { WallTextField } from './WallTextField';
import { wallTypingVars } from './wallTypingVars';
import { wallPressProps } from './wallPress';

const SERIF = "var(--font-dm-serif), 'DM Serif Display', Georgia, serif";

export interface WallTypingSheetProps {
  /** What the dialog is called, for a screen reader. */
  label: string;
  /** The small capitals over the heading ("Add to"). */
  kicker: ReactNode;
  /** The heading ("Shopping"). */
  title: ReactNode;
  /** Small words after the heading ("5 left"). */
  aside?: ReactNode;
  /** Beside Close, on the right of the small capitals (a "Type on your phone" button). */
  headerRight?: ReactNode;
  theme: FullscreenThemeTokens;
  /** The opener's accent: the stripe, the field's border, the caret and the action key. */
  accent: string;
  /** `useWallTyping`, owned by the opener so it can read and clear the words. */
  typing: WallTyping;
  placeholder: string;
  onAction: () => void;
  actionLabel?: string;
  actionIcon?: ReactNode;
  /** Faint and inert; nothing typed yet when not given. */
  actionDisabled?: boolean;
  onClose: () => void;
  /** Something is open over the sheet: the minute stops until it closes. */
  paused?: boolean;
  testId?: string;
  /** Under the field: what just happened ("Just added"), a `WallNotice`, a hint. */
  children?: ReactNode;
}

/**
 * Typing on the wall, as one sheet rising from the bottom: the wall sheets'
 * look (accent stripe, small capitals over a serif heading, Close), a
 * `WallTextField`, a slot for what happened, and the `text` keyboard docked
 * underneath. Closes with Close, a tap on the dark part, or a minute nobody
 * touches it. Sized at 1080 across the window's short side; on a landscape
 * wall the keys are 78 px tall so the whole sheet fits without scrolling.
 *
 * Each piece also works on its own (`useWallTyping`, `WallTextField`,
 * `WallKeyboard`, `wallTypingVars`) for a sheet that types and then turns
 * into a form.
 */
export function WallTypingSheet({
  label, kicker, title, aside, headerRight, theme, accent, typing, placeholder, onAction, actionLabel, actionIcon,
  actionDisabled, onClose, paused = false, testId = 'wall-typing-sheet', children,
}: WallTypingSheetProps) {
  const t = useTranslate('modules');
  const { P, landscape } = useWallOverlayScale();
  const disabled = actionDisabled ?? typing.text.trim() === '';

  return (
    <WallOverlay
      label={label}
      testId={testId}
      onClose={onClose}
      autoCloseMs={WALL_KEYBOARD_IDLE_MS}
      paused={paused}
      scrim={theme.isDark ? 'rgba(0,0,0,0.62)' : 'rgba(0,0,0,0.52)'}
      style={{ fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif' }}
    >
      <WallSheetPanel variant="sheet" theme={theme}>
        <div style={{ ...wallTypingVars(theme, accent), color: 'var(--wt-text)' }}>
          <div style={{ padding: `${P(26)}px ${P(56)}px ${P(28)}px`, borderTop: `${P(12)}px solid var(--wt-accent)` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: P(16), marginBottom: P(6) }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: P(22), letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--wt-text-3)' }}>
                {kicker}
              </span>
              {headerRight}
              <button
                type="button"
                {...wallPressProps}
                data-testid={`${testId}-close`}
                onClick={onClose}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: P(10), height: P(66), padding: `0 ${P(28)}px`,
                  borderRadius: P(33), border: `${P(2)}px solid var(--wt-border)`, background: 'transparent',
                  color: 'var(--wt-text)', font: 'inherit', fontSize: P(25), fontWeight: 600, cursor: 'pointer', flexShrink: 0,
                }}
              >
                <X size={P(26)} strokeWidth={2.6} aria-hidden="true" />
                {t('wallKeyboard.close')}
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', columnGap: P(18), marginBottom: P(24) }}>
              <span style={{ fontFamily: SERIF, fontSize: P(56), lineHeight: 1.12, color: 'var(--wt-text)', overflowWrap: 'anywhere' }}>{title}</span>
              {aside && <span style={{ fontSize: P(28), color: 'var(--wt-text-3)', fontVariantNumeric: 'tabular-nums' }}>{aside}</span>}
            </div>
            <WallTextField P={P} text={typing.text} placeholder={placeholder} left={typing.left} />
            {children && <div style={{ marginTop: P(22) }}>{children}</div>}
          </div>
          <WallKeyboard
            kind="text"
            P={P}
            keyHeight={landscape ? 78 : 104}
            shift={typing.shift}
            onShift={typing.onShift}
            onKey={typing.onKey}
            onDelete={typing.onDelete}
            onAction={onAction}
            onIdle={onClose}
            actionLabel={actionLabel}
            actionIcon={actionIcon}
            actionDisabled={disabled}
            paused={paused}
            round={typing.round}
          />
        </div>
      </WallSheetPanel>
    </WallOverlay>
  );
}
