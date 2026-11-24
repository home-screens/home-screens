'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useTranslate } from '@/i18n';
import { displayFetch } from '@/lib/display-fetch';
import { WallButton } from '@/components/modules/shared/WallButton';

/** How long the line stays up after the page loads. */
const SHOW_FOR_MS = 20_000;

/**
 * A small line at the bottom of the wall for a grown-up who is signed in and
 * looking at it in a browser. Their sign-in is what shows them the wall, so
 * it stops when they sign out. Tapping "Keep as a wall" gives this browser
 * its own place, and it goes on showing after that.
 *
 * It fades after twenty seconds and adds nothing unless it is tapped, so a
 * quick look never turns into a display. The page mounts it only for a
 * signed-in view that is not the editor's preview; a real wall never sees it.
 */
export default function KeepAsWallLine({ displayId }: { displayId?: string }) {
  const t = useTranslate('core');
  const [state, setState] = useState<'offered' | 'saving' | 'kept' | 'failed' | 'gone'>('offered');

  useEffect(() => {
    if (state !== 'offered' && state !== 'kept') return;
    const timer = setTimeout(() => setState('gone'), state === 'kept' ? 4_000 : SHOW_FOR_MS);
    return () => clearTimeout(timer);
  }, [state]);

  if (state === 'gone') return null;

  const keep = async () => {
    setState('saving');
    try {
      const res = await displayFetch('/api/display/walls/keep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...(displayId ? { displayId } : {}), width: window.innerWidth, height: window.innerHeight }),
      });
      setState(res.ok ? 'kept' : 'failed');
    } catch {
      setState('failed');
    }
  };

  return (
    <div
      data-testid="keep-as-wall"
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 24,
        transform: 'translateX(-50%)',
        zIndex: 2147483000,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        maxWidth: 'calc(100vw - 32px)',
        padding: '6px 6px 6px 18px',
        borderRadius: 999,
        background: 'rgba(10,10,10,0.82)',
        border: '1px solid rgba(255,255,255,0.14)',
        backdropFilter: 'blur(6px)',
        color: 'rgba(255,255,255,0.78)',
        fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif',
        fontSize: 15,
        lineHeight: 1.3,
      }}
    >
      <span>
        {state === 'kept' ? t('wallGate.kept') : state === 'failed' ? t('wallGate.keepFailed') : t('wallGate.keepLine')}
      </span>
      {state !== 'kept' && (
        <WallButton
          onClick={keep}
          disabled={state === 'saving'}
          style={{
            minHeight: 44,
            padding: '0 18px',
            borderRadius: 999,
            border: 0,
            background: '#fff',
            color: '#111',
            fontFamily: 'inherit',
            fontSize: 15,
            fontWeight: 600,
            whiteSpace: 'nowrap',
            cursor: 'pointer',
          }}
        >
          {t('wallGate.keepButton')}
        </WallButton>
      )}
      <WallButton
        onClick={() => setState('gone')}
        aria-label={t('wallGate.keepClose')}
        style={{
          minWidth: 44,
          minHeight: 44,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: 0,
          background: 'transparent',
          color: 'rgba(255,255,255,0.6)',
          cursor: 'pointer',
        }}
      >
        <X size={18} aria-hidden="true" />
      </WallButton>
    </div>
  );
}
