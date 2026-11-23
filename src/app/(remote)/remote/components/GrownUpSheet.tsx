'use client';

import { useEffect, useRef, useState } from 'react';
import { Delete, Lock } from 'lucide-react';
import { useTranslate } from '@/i18n';
import { GROWN_UP_CODE_LENGTH, grownUpWaitWords } from '@/lib/grown-up-code';
import { registerGrownUpAsker } from '@/lib/grown-up-client';
import { GROWN_UP_KEYS, useGrownUpEntry } from '@/hooks/useGrownUpEntry';
import { DOUBLE_TAP_MS } from '@/lib/sheet-tap-guard';
import SheetFrame from './SheetFrame';

const ACCENT = 'var(--hs-success)';

// The unlock route answers a wrong code with 422 and is open on the LAN, so
// a plain fetch is right here: `editorFetch` would read a 401 as an expired
// sign-in and leave for the login screen.
const unlockFetch = (url: string, init?: RequestInit) => fetch(url, init);

/**
 * The phone's grown-up code pad, in the phone's own sheet style: the same
 * steps as the wall's (`useGrownUpEntry`), drawn like `ConfirmSheet`. On the
 * `grownUp` layer, over every sheet, since whatever asked for the code (a
 * remove or "every time" question on the calendar) is still open under it.
 * Escape, Back and the dimmed area all cancel.
 */
function GrownUpSheet({ why, onUnlocked, onCancel }: { why: string; onUnlocked: () => void; onCancel: () => void }) {
  const t = useTranslate('core');
  const { digits, state, press } = useGrownUpEntry(unlockFetch, onUnlocked);
  const wrong = state.kind === 'wrong';
  const waiting = state.kind === 'waiting';
  const message = wrong ? t('grownUp.wrong')
    : state.kind === 'waiting' ? grownUpWaitWords(state.secondsLeft, t)
    : state.kind === 'offline' ? t('refusals.unreachable')
    : '';
  return (
    <SheetFrame
      layer="grownUp"
      label={t('grownUp.title')}
      onClose={onCancel}
      // It opens in answer to a tap; the second half of a double tap must not cancel it.
      settleMs={DOUBLE_TAP_MS}
      // On /chores it opens while the long press that unticks a chore is still held: that press's lift must not type a key.
      freshPressesOnly
      testId="grown-up-sheet"
      bottomGap={20}
      panelStyle={{ background: 'var(--hs-bg-panel)', borderRadius: '20px 20px 0 0', padding: '20px 16px', textAlign: 'center' }}
    >
      <div style={{ width: 48, height: 48, margin: '0 auto', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'color-mix(in srgb, var(--hs-success) 14%, transparent)', color: ACCENT }}>
        <Lock size={24} aria-hidden="true" />
      </div>
      <div style={{ fontSize: 19, fontWeight: 700, color: 'var(--hs-text-primary)', marginTop: 8 }}>{t('grownUp.title')}</div>
      <div style={{ fontSize: 14, color: 'var(--hs-text-faint)', marginTop: 4, lineHeight: 1.4 }}>{why}</div>
      <div
        data-testid="grown-up-dots"
        data-filled={digits.length}
        className={wrong ? 'grown-up-dots-wrong' : undefined}
        style={{ display: 'flex', gap: 14, justifyContent: 'center', margin: '18px 0 8px' }}
      >
        {Array.from({ length: GROWN_UP_CODE_LENGTH }, (_, i) => {
          const on = i < digits.length;
          const color = wrong ? 'var(--hs-danger)' : 'var(--hs-text-primary)';
          return <span key={i} style={{ width: 15, height: 15, borderRadius: '50%', border: `2px solid ${on || wrong ? color : 'var(--hs-text-faint)'}`, background: on ? color : 'transparent' }} />;
        })}
      </div>
      <div role="status" data-testid="grown-up-message" style={{ minHeight: 20, fontSize: 14, fontWeight: 600, color: 'var(--hs-danger)', marginBottom: 8 }}>{message}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {GROWN_UP_KEYS.map((key, i) => key === ''
          ? <span key={i} />
          : (
            <button
              key={i}
              type="button"
              className="press-scale"
              // Said, not set: a disabled key drops the focus to the page, and Escape no longer reaches the sheet.
              // The pad already ignores keys while it checks or waits.
              aria-disabled={waiting || state.kind === 'checking'}
              aria-label={key === 'del' ? t('actions.delete') : key}
              data-testid={`grown-up-key-${key}`}
              onClick={() => press(key)}
              style={{ height: 56, borderRadius: 14, border: 'none', background: 'var(--hs-bg-hover)', color: 'var(--hs-text-primary)', fontSize: 24, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: waiting ? 0.35 : 1, cursor: 'pointer' }}
            >
              {key === 'del' ? <Delete size={22} aria-hidden="true" /> : key}
            </button>
          ))}
      </div>
      <button
        type="button"
        className="press-scale"
        data-testid="grown-up-cancel"
        onClick={onCancel}
        style={{ width: '100%', minHeight: 48, marginTop: 10, borderRadius: 12, border: 'none', background: 'var(--hs-bg-hover)', color: 'var(--hs-text-primary)', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}
      >
        {t('actions.cancel')}
      </button>
    </SheetFrame>
  );
}

/**
 * Mounted once by the phone's layout, for every surface under it (`/remote`
 * and `/chores`): the sheet whenever a write through `grownUpFetch` needs
 * the code.
 */
export function GrownUpSheetLayer() {
  const [asking, setAsking] = useState<{ why: string; resolve: (ok: boolean) => void } | null>(null);
  const askingRef = useRef(asking);
  askingRef.current = asking;
  useEffect(() => registerGrownUpAsker((why) => new Promise<boolean>((resolve) => {
    askingRef.current?.resolve(false);
    setAsking({ why, resolve });
  })), []);
  if (!asking) return null;
  const finish = (ok: boolean) => {
    asking.resolve(ok);
    setAsking(null);
  };
  return <GrownUpSheet why={asking.why} onUnlocked={() => finish(true)} onCancel={() => finish(false)} />;
}
