'use client';

import { useEffect, useState } from 'react';
import { useTranslate } from '@/i18n';
import { UI_MONO_STACK, UI_SANS_STACK } from '@/lib/font-registry';

/**
 * What a display shows when it resolves zero screens — none configured yet,
 * or every screen disabled.
 *
 * The state this exists for is the first five minutes of a new install: a Pi
 * boots into chromium, the config has no screens, and the panel is a black
 * rectangle. The single most useful thing to put there is the hub's own
 * address, because that is the one fact the person standing in front of the
 * display cannot look up — they don't yet know whether the hub answers to a
 * hostname, an IP, or which port. `window.location.origin` is exactly the URL
 * this kiosk is already talking to, so it is always right.
 *
 * Deliberately a watermark, not a UI: nothing here is brighter than a third
 * of white on black, there are no buttons, and `settings.setupHintEnabled:
 * false` removes it entirely for anyone who wants a blank display to be
 * blank. That toggle is per-display overridable, so a wall panel can stay
 * dark while a newly-added kiosk still shows the hint.
 *
 * Sizes are in `vmin` because this renders at the raw viewport, outside the
 * `displayW`/`displayH` scaling the rotator applies to real screens — the
 * same markup has to read correctly on a 1080x1920 portrait panel and in a
 * laptop browser tab.
 */
export default function EmptyDisplayHint() {
  const t = useTranslate('core');

  // Resolved after mount, not during render: this component is server-rendered
  // as part of the display route, where `window` does not exist and the origin
  // is not knowable. Rendering the pill only once the origin is in hand costs
  // one frame and avoids a hydration mismatch.
  const [origin, setOrigin] = useState<string | null>(null);
  useEffect(() => { setOrigin(window.location.origin); }, []);

  return (
    <div
      data-testid="empty-display-hint"
      style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        gap: 'clamp(14px, 2.6vmin, 34px)',
        padding: 'clamp(24px, 7vmin, 96px)',
        boxSizing: 'border-box',
        backgroundColor: '#000',
        color: '#fff',
        fontFamily: UI_SANS_STACK,
      }}
    >
      <div
        style={{
          fontSize: 'clamp(10px, 2vmin, 26px)',
          fontWeight: 600,
          letterSpacing: '0.34em',
          textTransform: 'uppercase',
          opacity: 0.3,
        }}
      >
        {t('emptyDisplay.eyebrow')}
      </div>

      <div style={{ fontSize: 'clamp(26px, 5.9vmin, 76px)', fontWeight: 200, letterSpacing: '-0.01em', opacity: 0.34 }}>
        {t('emptyDisplay.headline')}
      </div>

      <div style={{ fontSize: 'clamp(14px, 2.8vmin, 36px)', fontWeight: 300, lineHeight: 1.5, opacity: 0.24, maxWidth: '22em' }}>
        {t('emptyDisplay.body')}
      </div>

      {origin && (
        <div
          style={{
            fontFamily: UI_MONO_STACK,
            fontSize: 'clamp(12px, 2.4vmin, 31px)',
            opacity: 0.3,
            border: '1px solid rgba(255,255,255,0.14)',
            borderRadius: 999,
            padding: 'clamp(6px, 1.1vmin, 15px) clamp(14px, 2.4vmin, 32px)',
            wordBreak: 'break-all',
          }}
        >
          {`${origin}/editor`}
        </div>
      )}

      <div style={{ fontSize: 'clamp(10px, 1.85vmin, 24px)', fontWeight: 300, opacity: 0.16 }}>
        {t('emptyDisplay.hideHint')}
      </div>
    </div>
  );
}
