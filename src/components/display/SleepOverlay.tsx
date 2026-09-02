'use client';

import type { DisplayState } from '@/hooks/useSleepManager';
import type { ScreensaverSettings } from '@/types/config';
import { DISPLAY_LAYERS } from '@/lib/display-layers';
import Screensaver from './Screensaver';

interface SleepOverlayProps {
  displayState: DisplayState;
  dimOpacity: number;
  /**
   * A standing remote/Display Control brightness (see useSleepManager). A
   * brightness choice dims the content and draws nothing over it; only the
   * idle and scheduled dim paths get the screensaver.
   */
  brightnessOverride?: number | null;
  screensaver?: ScreensaverSettings;
  timezone?: string;
}

/**
 * Full-screen overlay that dims or blacks out the display. Renders above all
 * content, click-through.
 *
 * What each path shows:
 *   - brightness slider / remote brightness: content dimmed to the chosen
 *     level, no overlay content
 *   - idle dim: content dimmed, screensaver if enabled
 *   - scheduled dim window: content dimmed, screensaver if enabled
 *   - sleep: black
 */
export default function SleepOverlay({
  displayState,
  dimOpacity,
  brightnessOverride = null,
  screensaver,
  timezone,
}: SleepOverlayProps) {
  if (displayState === 'active') return null;

  const screensaverMode = screensaver?.mode ?? 'clock';
  const showScreensaver = displayState === 'dimmed' && brightnessOverride === null && screensaverMode !== 'off';

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
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: '#000',
          opacity: dimOpacity,
          transition: 'opacity 1s ease-in-out',
        }}
      />

      {showScreensaver && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 1 }}>
          <Screensaver mode={screensaverMode} timezone={timezone} />
        </div>
      )}
    </div>
  );
}
