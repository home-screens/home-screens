'use client';

import type { DisplayState } from '@/hooks/useSleepManager';
import type { ScreensaverSettings } from '@/types/config';
import { DISPLAY_LAYERS } from '@/lib/display-layers';
import Screensaver from './Screensaver';

interface SleepOverlayProps {
  displayState: DisplayState;
  dimOpacity: number;
  screensaver?: ScreensaverSettings;
  timezone?: string;
}

/**
 * Full-screen overlay that dims or blacks out the display.
 * Renders above all content. Shows optional screensaver during dimmed state.
 */
export default function SleepOverlay({
  displayState,
  dimOpacity,
  screensaver,
  timezone,
}: SleepOverlayProps) {
  if (displayState === 'active') return null;

  const screensaverMode = screensaver?.mode ?? 'clock';
  const showScreensaver = displayState === 'dimmed' && screensaverMode !== 'off';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: DISPLAY_LAYERS.sleep,
        pointerEvents: 'none',
        viewTransitionName: 'sleep-overlay',
      } as React.CSSProperties}
    >
      {/* Black overlay — opacity controls dimming level */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: '#000',
          opacity: dimOpacity,
          transition: 'opacity 1s ease-in-out',
        }}
      />

      {/* Screensaver content (above the dim overlay) */}
      {showScreensaver && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 1 }}>
          <Screensaver mode={screensaverMode} timezone={timezone} />
        </div>
      )}
    </div>
  );
}
