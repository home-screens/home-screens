'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Delete, Lock, LockOpen } from 'lucide-react';
import { useTranslate } from '@/i18n';
import { displayFetch } from '@/lib/display-fetch';
import { DISPLAY_LAYERS } from '@/lib/display-layers';
import { getThemeTokens } from '@/lib/fullscreen-themes';
import { GROWN_UP_CODE_LENGTH } from '@/lib/grown-up-code';
import { lockNow, registerGrownUpAsker } from '@/lib/grown-up-client';
import { useGrownUpUnlock } from '@/hooks/useGrownUp';
import { GROWN_UP_KEYS, useGrownUpEntry } from '@/hooks/useGrownUpEntry';
import { WallOverlay } from './WallOverlay';
import { useWallOverlayScale } from './useWallOverlayScale';
import { wallPressProps } from './wallPress';

/** The pad closes itself after this long with nobody touching it. */
export const GROWN_UP_PAD_IDLE_MS = 60_000;
/** The pad's height in wall pixels, for fitting it on a short landscape screen. */
const PAD_HEIGHT = 1260;
const ACCENT = '#f59e0b';
const WRONG = '#f87171';

interface GrownUpPadProps {
  /** What the code is for, in plain words. */
  why: string;
  /** The hub took the code (or has none to ask for): the job goes ahead. */
  onUnlocked: () => void;
  onCancel: () => void;
}

/**
 * The wall's grown-up code pad: four dots, big keys and Cancel, over the
 * wall like the day sheet. The fourth digit sends it; there is no OK key. A
 * wrong code shakes the dots red and empties them; too many and the keys rest
 * until the hub's wait is over. Closes itself after a minute untouched.
 */
export function GrownUpPad({ why, onUnlocked, onCancel }: GrownUpPadProps) {
  const t = useTranslate('core');
  const { h, unit } = useWallOverlayScale();
  // Wall pixels to screen pixels, shrunk on a short (landscape) screen so the
  // whole pad fits with room to spare.
  const s = Math.min(unit, (h * 0.94) / PAD_HEIGHT);
  const P = (n: number) => n * s;
  const theme = getThemeTokens('charcoal');
  const { digits, state, press } = useGrownUpEntry(displayFetch, onUnlocked);

  const waiting = state.kind === 'waiting';
  const wrong = state.kind === 'wrong';
  const message = wrong ? t('grownUp.wrong')
    : state.kind === 'waiting' ? t('grownUp.tooMany', { count: state.secondsLeft })
    : state.kind === 'offline' ? t('refusals.unreachable')
    : '';

  const keyStyle: CSSProperties = {
    height: P(136),
    borderRadius: P(36),
    background: 'rgba(255,255,255,0.08)',
    border: 0,
    color: theme.text,
    fontSize: P(60),
    fontWeight: 600,
    fontFamily: 'inherit',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    touchAction: 'manipulation',
    cursor: 'pointer',
    opacity: waiting ? 0.28 : 1,
  };

  return (
    <WallOverlay label={t('grownUp.title')} onClose={onCancel} autoCloseMs={GROWN_UP_PAD_IDLE_MS} scrim="rgba(0,0,0,0.7)" testId="grown-up-pad">
      <div
        onClick={(e) => e.stopPropagation()}
        className="wall-sheet-panel"
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: P(800),
          background: theme.surface,
          color: theme.text,
          borderRadius: P(52),
          boxShadow: '0 30px 80px rgba(0,0,0,0.6)',
          overflow: 'hidden',
          textAlign: 'center',
          cursor: 'default',
          fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif',
          animation: 'wall-card-in 250ms ease-out',
        }}
      >
        <div style={{ height: P(12), background: waiting ? theme.textMuted : ACCENT }} />
        <div style={{ width: P(120), height: P(120), borderRadius: '50%', margin: `${P(46)}px auto ${P(22)}px`, display: 'flex', alignItems: 'center', justifyContent: 'center', background: waiting ? 'rgba(255,255,255,0.08)' : 'rgba(245,158,11,0.16)', color: waiting ? theme.textMuted : ACCENT }}>
          <Lock size={P(60)} strokeWidth={2.4} aria-hidden="true" />
        </div>
        <div style={{ fontSize: P(56), fontWeight: 750, letterSpacing: '-0.01em' }}>{t('grownUp.title')}</div>
        <div style={{ fontSize: P(30), color: theme.textSecondary, margin: `${P(10)}px ${P(60)}px 0`, lineHeight: 1.35 }}>{why}</div>
        <div
          data-testid="grown-up-dots"
          data-filled={digits.length}
          className={wrong ? 'grown-up-dots-wrong' : undefined}
          style={{ display: 'flex', gap: P(34), justifyContent: 'center', margin: `${P(44)}px 0 ${P(18)}px` }}
        >
          {Array.from({ length: GROWN_UP_CODE_LENGTH }, (_, i) => {
            const on = i < digits.length;
            const color = wrong ? WRONG : theme.text;
            return <span key={i} style={{ width: P(40), height: P(40), borderRadius: '50%', border: `${P(4)}px solid ${on ? color : wrong ? WRONG : theme.textMuted}`, background: on ? color : 'transparent' }} />;
          })}
        </div>
        <div role="status" data-testid="grown-up-message" style={{ minHeight: P(46), fontSize: P(32), fontWeight: 600, color: message && state.kind !== 'typing' ? '#fca5a5' : theme.text }}>{message}</div>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(3, ${P(196)}px)`, gap: P(22), justifyContent: 'center', margin: `${P(18)}px 0 ${P(30)}px` }}>
          {GROWN_UP_KEYS.map((key, i) => key === ''
            ? <span key={i} />
            : (
              <button
                key={i}
                type="button"
                {...wallPressProps}
                disabled={waiting || state.kind === 'checking'}
                aria-label={key === 'del' ? t('actions.delete') : key}
                data-testid={`grown-up-key-${key}`}
                onClick={() => press(key)}
                style={keyStyle}
              >
                {key === 'del' ? <Delete size={P(56)} strokeWidth={2.2} aria-hidden="true" /> : key}
              </button>
            ))}
        </div>
        <button
          type="button"
          {...wallPressProps}
          data-testid="grown-up-cancel"
          onClick={onCancel}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: `calc(100% - ${P(120)}px)`, height: P(112), margin: `0 ${P(60)}px ${P(44)}px`, borderRadius: P(32), border: `${P(3)}px solid rgba(255,255,255,0.14)`, background: 'transparent', color: theme.text, fontSize: P(38), fontWeight: 650, fontFamily: 'inherit', cursor: 'pointer' }}
        >
          {t('actions.cancel')}
        </button>
      </div>
    </WallOverlay>
  );
}

/**
 * Mounted once on the wall: the pad whenever a job needs the code, and the
 * "Unlocked" chip while this wall is unlocked. Registers the wall's asker
 * with `grown-up-client`, so any write sent through `grownUpFetch` can ask.
 */
export function GrownUpPadLayer() {
  const [asking, setAsking] = useState<{ why: string; resolve: (ok: boolean) => void } | null>(null);
  const askingRef = useRef(asking);
  askingRef.current = asking;

  useEffect(() => registerGrownUpAsker((why) => new Promise<boolean>((resolve) => {
    // A second ask while one is up replaces it; the first job is not sent.
    askingRef.current?.resolve(false);
    setAsking({ why, resolve });
  })), []);

  const finish = (ok: boolean) => {
    asking?.resolve(ok);
    setAsking(null);
  };

  return (
    <>
      {asking && <GrownUpPad why={asking.why} onUnlocked={() => finish(true)} onCancel={() => finish(false)} />}
      <UnlockedChip />
    </>
  );
}

/** "Unlocked for N more minutes", with Lock now, at the top of the wall while it is unlocked. */
function UnlockedChip() {
  const t = useTranslate('core');
  const current = useGrownUpUnlock();
  const { unit } = useWallOverlayScale();
  const P = (n: number) => n * unit;
  const [, tick] = useState(0);
  useEffect(() => {
    if (!current) return;
    const id = setInterval(() => tick((n) => n + 1), 15_000);
    return () => clearInterval(id);
  }, [current]);
  if (!current || typeof document === 'undefined') return null;
  const minutes = Math.max(1, Math.ceil((current.expiresAt - Date.now()) / 60_000));
  return createPortal(
    <div
      data-testid="grown-up-unlocked"
      style={{
        position: 'fixed',
        top: P(24),
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: DISPLAY_LAYERS.moduleOverlay,
        display: 'flex',
        alignItems: 'center',
        gap: P(18),
        padding: `${P(12)}px ${P(14)}px ${P(12)}px ${P(26)}px`,
        borderRadius: 999,
        background: 'rgba(20,83,45,0.94)',
        border: `${P(2)}px solid rgba(74,222,128,0.5)`,
        boxShadow: '0 16px 40px rgba(0,0,0,0.45)',
        fontSize: P(30),
        fontWeight: 650,
        color: '#dcfce7',
        whiteSpace: 'nowrap',
        fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif',
      }}
    >
      <LockOpen size={P(40)} strokeWidth={2.2} color="#4ade80" aria-hidden="true" />
      {t('grownUp.unlocked', { count: minutes })}
      <button
        type="button"
        {...wallPressProps}
        data-testid="grown-up-lock-now"
        onClick={lockNow}
        style={{ padding: `${P(12)}px ${P(26)}px`, borderRadius: 999, border: 0, background: 'rgba(255,255,255,0.14)', color: '#fff', fontSize: P(30), fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', touchAction: 'manipulation' }}
      >
        {t('grownUp.lockNow')}
      </button>
    </div>,
    document.body,
  );
}
