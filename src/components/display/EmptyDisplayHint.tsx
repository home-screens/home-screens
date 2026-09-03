'use client';

import { QRCodeSVG } from 'qrcode.react';
import { useTranslate } from '@/i18n';
import { useOrigin } from '@/hooks/useOrigin';
import { UI_MONO_STACK, UI_SANS_STACK } from '@/lib/font-registry';

interface EmptyDisplayHintProps {
  /**
   * True when this display had screens before and now has none, or every
   * screen is switched off: someone did this on purpose, so the "want a
   * blank screen instead?" line tells them where the toggle is. On a true
   * first boot there is nothing to hide yet and the line is left out.
   */
  deliberatelyEmpty?: boolean;
}

/**
 * What a display shows when it has nothing to render — no screens configured,
 * every screen disabled, or (the fresh-install case) screens with no modules.
 *
 * The state this exists for is the first five minutes of a new install: a Pi
 * boots into chromium, the config has no screens, and the panel is a black
 * rectangle. The single most useful thing to put there is the hub's own
 * address, because that is the one fact the person standing in front of the
 * display cannot look up — they don't yet know whether the hub answers to a
 * hostname, an IP, or which port. `useOrigin` gives the URL this kiosk is
 * already talking to, with a `localhost` origin (a kiosk on the hub Pi itself)
 * swapped for the hub's LAN address. The bare origin is printed rather than
 * `/editor`: `/` lands a laptop on the editor and a phone on the launcher, and
 * it is the shortest thing to type from across a room. A QR code of the same
 * origin saves the typing for anyone with a phone.
 *
 * Deliberately a watermark, not a UI: there are no buttons, nothing is
 * brighter than the address (62% white) and the QR code (50%), and
 * `settings.setupHintEnabled: false` removes it entirely for anyone who wants
 * a blank display to be blank. That toggle is per-display overridable, so a
 * wall panel can stay dark while a newly-added kiosk still shows the hint.
 *
 * Sizes are in `vmin` because this renders at the raw viewport, outside the
 * `displayW`/`displayH` scaling the rotator applies to real screens — the
 * same markup has to read correctly on a 1080x1920 portrait panel and in a
 * laptop browser tab.
 */
export default function EmptyDisplayHint({ deliberatelyEmpty = false }: EmptyDisplayHintProps) {
  const t = useTranslate('core');

  // `''` until resolved after mount: this component is server-rendered as part
  // of the display route, where the origin is not knowable. Rendering the pill
  // only once the origin is in hand costs a frame and avoids a hydration
  // mismatch.
  const origin = useOrigin();

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
        gap: 'clamp(14px, 2.6vmin, 30px)',
        padding: 'clamp(24px, 7vmin, 96px)',
        boxSizing: 'border-box',
        backgroundColor: '#000',
        color: '#fff',
        fontFamily: UI_SANS_STACK,
      }}
    >
      <div
        style={{
          fontSize: 'clamp(10px, 2vmin, 24px)',
          fontWeight: 600,
          letterSpacing: '0.32em',
          textTransform: 'uppercase',
          opacity: 0.34,
        }}
      >
        {t('emptyDisplay.eyebrow')}
      </div>

      <div style={{ fontSize: 'clamp(26px, 5.9vmin, 78px)', fontWeight: 200, letterSpacing: '-0.01em', opacity: 0.55 }}>
        {t('emptyDisplay.headline')}
      </div>

      <div style={{ fontSize: 'clamp(14px, 2.8vmin, 32px)', fontWeight: 300, lineHeight: 1.4, opacity: 0.4, maxWidth: '24em' }}>
        {t('emptyDisplay.body')}
      </div>

      {origin && (
        <>
          <div
            data-testid="empty-display-origin"
            style={{
              fontFamily: UI_MONO_STACK,
              fontSize: 'clamp(12px, 2.5vmin, 32px)',
              color: 'rgba(255,255,255,0.62)',
              border: '2px solid rgba(255,255,255,0.35)',
              borderRadius: 999,
              padding: 'clamp(7px, 1.4vmin, 18px) clamp(14px, 2.6vmin, 34px)',
              wordBreak: 'break-all',
            }}
          >
            {origin}
          </div>
          <QRCodeSVG
            value={origin}
            marginSize={2}
            bgColor="rgba(255,255,255,0.5)"
            fgColor="rgba(0,0,0,0.9)"
            style={{ width: 'clamp(96px, 21vmin, 230px)', height: 'auto', borderRadius: 8 }}
          />
        </>
      )}

      {deliberatelyEmpty && (
        <div style={{ fontSize: 'clamp(10px, 1.85vmin, 20px)', fontWeight: 300, opacity: 0.28 }}>
          {t('emptyDisplay.hideHint')}
        </div>
      )}
    </div>
  );
}
