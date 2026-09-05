'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { QRCodeSVG } from 'qrcode.react';
import type { SavedMeal } from '@/types/config';
import { useTranslate } from '@/i18n';
import { useInteractionHold } from '@/lib/interaction-hold';
import { DISPLAY_LAYERS } from '@/lib/display-layers';

const QR_AUTO_DISMISS_MS = 30_000;
const IFRAME_AUTO_CLOSE_MS = 10 * 60_000;

interface RecipeOverlayProps {
  meal: SavedMeal;
  variant: 'qr' | 'iframe';
  onClose: () => void;
}

/**
 * Fullscreen recipe overlay for kiosk displays. Portals to document.body so it
 * escapes the zoom-scaled ScreenRenderer and the module's bounding box.
 *
 * The iframe variant keeps a "Show QR code" escape hatch because sites that
 * block embedding (X-Frame-Options/CSP) just render a blank frame — the block
 * is invisible cross-origin, so the fallback must always be offered.
 */
export function RecipeOverlay({ meal, variant, onClose }: RecipeOverlayProps) {
  const t = useTranslate('modules');
  // Internal so the iframe variant can switch itself to the QR fallback.
  const [view, setView] = useState<'qr' | 'iframe'>(variant);
  const recipeUrl = meal.recipeUrl ?? '';

  // Hold screen rotation while open so the next screen doesn't unmount the
  // overlay out from under the reader; the timers below bound the hold.
  useInteractionHold();

  // Safety timers: a kiosk nobody is standing at must not show a recipe forever.
  // onClose lives in a ref so parent re-renders (e.g. the 60s clock tick) can
  // never reset the countdown — only switching views restarts it.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const ms = view === 'qr' ? QR_AUTO_DISMISS_MS : IFRAME_AUTO_CLOSE_MS;
    const timer = setTimeout(() => onCloseRef.current(), ms);
    return () => clearTimeout(timer);
  }, [view]);

  if (typeof document === 'undefined') return null;

  // Everything below is painted on the overlay's own near-black scrim, so its
  // white ink and white QR are for that scrim, not the card (plan 50, item 19).
  const overlay = view === 'qr' ? (
    <div
      role="dialog"
      aria-label={meal.name}
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        // Below sleep/alert: a sleeping display must black out over a recipe.
        zIndex: DISPLAY_LAYERS.moduleOverlay,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1.5rem',
        backgroundColor: 'rgba(0,0,0,0.92)',
        color: '#fff',
        cursor: 'pointer',
      }}
    >
      {meal.emoji && <span style={{ fontSize: '4rem', lineHeight: 1 }}>{meal.emoji}</span>}
      <span style={{ fontSize: '2rem', fontWeight: 600, textAlign: 'center', maxWidth: '80%' }}>
        {meal.name}
      </span>
      {/* QR must be black-on-white to scan reliably on a dark backdrop. */}
      <div
        style={{
          backgroundColor: '#fff',
          borderRadius: '1rem',
          padding: '1.5rem',
          display: 'flex',
        }}
      >
        <QRCodeSVG
          value={recipeUrl}
          fgColor="#000000"
          bgColor="#ffffff"
          style={{ width: 'min(60vw, 60vh)', height: 'min(60vw, 60vh)' }}
        />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.35rem' }}>
        <span style={{ fontSize: '1.1rem', opacity: 0.9 }}>{t('meal-planner.scanToOpenRecipe')}</span>
        <span style={{ fontSize: '0.85rem', opacity: 0.5 }}>{t('meal-planner.tapToDismiss')}</span>
      </div>
    </div>
  ) : (
    <div
      role="dialog"
      aria-label={meal.name}
      style={{
        position: 'fixed',
        inset: 0,
        // Below sleep/alert: a sleeping display must black out over a recipe.
        zIndex: DISPLAY_LAYERS.moduleOverlay,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#000',
      }}
    >
      {/* Header bar: title, QR fallback, close */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          padding: '0.6rem 1rem',
          backgroundColor: '#111',
          color: '#fff',
          flexShrink: 0,
        }}
      >
        {meal.emoji && <span style={{ fontSize: '1.5rem', lineHeight: 1 }}>{meal.emoji}</span>}
        <span
          style={{
            fontSize: '1.15rem',
            fontWeight: 600,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
            minWidth: 0,
          }}
        >
          {meal.name}
        </span>
        <button
          type="button"
          onClick={() => setView('qr')}
          style={{
            fontSize: '0.9rem',
            fontWeight: 500,
            color: '#fff',
            backgroundColor: 'rgba(255,255,255,0.12)',
            border: 'none',
            borderRadius: '0.5rem',
            padding: '0.6rem 1rem',
            minHeight: 44,
            cursor: 'pointer',
          }}
        >
          {t('meal-planner.showQrInstead')}
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('meal-planner.closeRecipe')}
          style={{
            fontSize: '1.4rem',
            lineHeight: 1,
            color: '#fff',
            backgroundColor: 'rgba(255,255,255,0.12)',
            border: 'none',
            borderRadius: '0.5rem',
            width: 44,
            height: 44,
            cursor: 'pointer',
          }}
        >
          &#10005;
        </button>
      </div>
      {/* White background so a frame blocked by X-Frame-Options is visibly
          blank instead of a black hole. */}
      <iframe
        src={recipeUrl}
        title={meal.name}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer"
        style={{ flex: 1, width: '100%', border: 'none', backgroundColor: '#fff' }}
      />
    </div>
  );

  return createPortal(overlay, document.body);
}
