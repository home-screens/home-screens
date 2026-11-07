'use client';

import { useMemo } from 'react';
import type { GlobalSettings, Screen } from '@/types/config';
import { useTranslate } from '@/i18n';
import { getThemeTokens } from '@/lib/fullscreen-themes';
import { openedScreenTheme } from '@/lib/on-demand-screen';
import { wallPressProps } from '@/components/modules/shared/wallPress';

interface OpenedScreenBackChipProps {
  /** The opened screen in front of the viewer, for its theme. */
  screen: Screen | null;
  /** The name of the screen the display left; null when it has nowhere to go back to. */
  returnName: string | null;
  settings: Pick<GlobalSettings, 'fullscreenTheme'>;
  onBack: () => void;
  /** Drawn to show its place (the editor canvas): no tap, and a dashed edge marks the strip. */
  inert?: boolean;
  /** An overlay holds the display: keep the strip, hide the chip. */
  chipHidden?: boolean;
  /** When the display goes back on its own (epoch ms); the chip drains over the last seconds. */
  goesBackAt?: number | null;
  /** Hover words for the editor's drawn copy. */
  title?: string;
}

/** Sizes in the wall's own pixels (the frame is 1080 wide and zooms as one). */
export const CHIP_HEIGHT = 72;
export const CHIP_INSET = 44;
/** The strip at the bottom of the frame the chip occupies, which the screen's content keeps clear. */
export const CHIP_CLEAR_PX = CHIP_HEIGHT + CHIP_INSET * 2;
/** The chip grows into the strip before it shortens a long name. */
const CHIP_MAX_WIDTH = 900;
/** How long before going back the chip starts draining, so a touch can keep the screen. */
export const LEAVING_WARNING_MS = 15_000;
/** The fade at the top of the strip, so a row cut by it reads as "more below". */
const FADE_PX = 36;

/**
 * The way back from a screen that shows only when opened. Drawn inside the
 * display frame, bottom left, in a strip painted the opened screen's own page
 * colour so the screen reads as one page with a way home at its foot, and
 * where the pagination dots are not (they are hidden while an opened screen
 * is up, since it has no place in the rotation). The chip is filled with the
 * theme's ink so it reads as a control from across a room. In its last
 * fifteen seconds a thin line along its top edge empties, the only warning
 * that the screen is about to go back, and any touch refills it.
 */
export default function OpenedScreenBackChip({ screen, returnName, settings, onBack, inert = false, chipHidden = false, goesBackAt = null, title }: OpenedScreenBackChipProps) {
  const t = useTranslate('core');
  const tokens = getThemeTokens(openedScreenTheme(screen, settings.fullscreenTheme));
  const label = returnName ? t('openedScreen.backTo', { name: returnName }) : t('openedScreen.back');
  // Measured once per deadline: the drain starts this many ms from then,
  // negative when the deadline is already less than LEAVING_WARNING_MS away
  // (the line starts part drained). The chip redraws on every clock tick, and
  // a delay measured again from a later now would pull the running drain
  // early. Keyed on the deadline so a touch (a new deadline) starts it again
  // from full.
  const drainDelay = useMemo(() => (goesBackAt ? goesBackAt - LEAVING_WARNING_MS - Date.now() : 0), [goesBackAt]);
  return (
    <div
      data-testid="opened-screen-back"
      data-chip-hidden={chipHidden ? '' : undefined}
      title={title}
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: CHIP_CLEAR_PX,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        paddingLeft: CHIP_INSET,
        paddingRight: CHIP_INSET,
        background: tokens.bg,
        backgroundImage: tokens.bgImage,
        borderTop: inert ? `3px dashed color-mix(in srgb, ${tokens.text} 35%, transparent)` : undefined,
      }}
    >
      {!inert && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: -FADE_PX,
            height: FADE_PX,
            background: `linear-gradient(to bottom, transparent, ${tokens.bg})`,
            pointerEvents: 'none',
          }}
        />
      )}
      {!chipHidden && (
        <button
          type="button"
          {...(inert ? {} : wallPressProps)}
          onClick={inert ? undefined : onBack}
          aria-disabled={inert || undefined}
          aria-label={label}
          style={{
            position: 'relative',
            overflow: 'hidden',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 16,
            height: CHIP_HEIGHT,
            padding: '0 32px 0 24px',
            borderRadius: 999,
            border: 0,
            background: tokens.text,
            color: tokens.bg,
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.25)',
            font: 'inherit',
            fontSize: 30,
            fontWeight: 600,
            cursor: inert ? 'default' : 'pointer',
            touchAction: 'manipulation',
            whiteSpace: 'nowrap',
            maxWidth: CHIP_MAX_WIDTH,
          }}
        >
          <svg viewBox="0 0 24 24" width={34} height={34} fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
            <path d="M19 12H5" /><path d="m12 19-7-7 7-7" />
          </svg>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
          {goesBackAt && (
            <span
              key={goesBackAt}
              data-testid="opened-screen-leaving"
              aria-hidden="true"
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: 0,
                height: 6,
                background: tokens.bg,
                opacity: 0,
                transformOrigin: 'left center',
                animation: `opened-screen-drain ${LEAVING_WARNING_MS}ms linear ${drainDelay}ms forwards`,
              }}
            />
          )}
        </button>
      )}
      <style>{'@keyframes opened-screen-drain { from { opacity: 1; transform: scaleX(1); } to { opacity: 1; transform: scaleX(0); } }'}</style>
    </div>
  );
}
