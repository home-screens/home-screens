'use client';

import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { Play } from 'lucide-react';
import { useTranslate } from '@/i18n';
import Glyph from '@/components/ui/Glyph';
import { displayFetch } from '@/lib/display-fetch';
import {
  DEFAULT_TIMER_SOUND,
  QUICK_TIMER_PRESETS_SEC,
  materializeSession,
  routineTotalSec,
  wallTimerTargets,
} from '@/lib/timer-logic';
import { ROUTINES_URL, asRoutineSnapshot } from '@/lib/timer-client';
import { requestTimerRefresh } from '@/lib/timer-presence';
import type { Routine, TimerSession } from '@/types/timers';
import { WallOverlay } from '@/components/modules/shared/WallOverlay';
import { useWallOverlayScale } from '@/components/modules/shared/useWallOverlayScale';
import { wallPress } from '@/components/modules/shared/wallPress';

/** A Timers sheet nobody touches closes after this long, like the other sheets on the wall. */
export const TIMERS_SHEET_AUTO_CLOSE_MS = 60_000;

const SESSION_URL = '/api/timers/session';

/** The timer screens' own colours, so the sheet reads as the start of what follows. */
const C = {
  surface: '#0f1621',
  edge: 'rgba(255,255,255,0.08)',
  tile: 'rgba(255,255,255,0.06)',
  faint: 'rgba(255,255,255,0.45)',
  muted: 'rgba(255,255,255,0.55)',
  go: '#34d399',
  goInk: '#06281c',
  accent: 'linear-gradient(90deg, #2dd4bf, #34d399)',
};

type Choice = { kind: 'routine'; routine: Routine } | { kind: 'quick'; durationSec: number };

export interface TimersSheetProps {
  /** The display the sheet is on: the timer starts there. */
  displayId: string | undefined;
  /** The hub has a list of displays (else one display, which every timer covers). */
  hasDisplayList: boolean;
  /**
   * False in an editor preview window: the sheet shows and a pick closes it,
   * but nothing starts, since a preview must never act on the real wall.
   */
  live: boolean;
  onClose: () => void;
}

/**
 * What the Timers button (dock or panel) opens: the family's routines (made
 * on the phone) and the phone's quick lengths, each started by one tap on the
 * display the sheet is on. The house has one running timer, so when one is
 * already going on another display the sheet asks first, as the phone does.
 * Drawn at 1080 across the window's short side, in the timer screens' own
 * colours, since it portals over the whole wall.
 */
export function TimersSheet({ displayId, hasDisplayList, live, onClose }: TimersSheetProps) {
  const t = useTranslate('modules');
  const tc = useTranslate('core');
  const { P, landscape } = useWallOverlayScale();
  const [routines, setRoutines] = useState<Routine[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [confirm, setConfirm] = useState<Choice | null>(null);
  const [busy, setBusy] = useState(false);
  const [startFailed, setStartFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await displayFetch(ROUTINES_URL);
        const snapshot = res.ok ? asRoutineSnapshot(await res.json()) : null;
        if (!alive) return;
        if (snapshot) setRoutines(snapshot.routines);
        else setLoadFailed(true);
      } catch {
        if (alive) setLoadFailed(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const start = useCallback(async (choice: Choice) => {
    if (!live) {
      onClose();
      return;
    }
    setBusy(true);
    setStartFailed(false);
    const targets = wallTimerTargets(displayId, hasDisplayList);
    // A routine keeps its own look and sound; a quick timer takes the phone's
    // starting choices (Timer face, sound on).
    const body = choice.kind === 'routine'
      ? { action: 'start', kind: 'routine', routineId: choice.routine.id, targets }
      : { action: 'start', kind: 'quick', durationSec: choice.durationSec, view: 'face', sound: DEFAULT_TIMER_SOUND, targets };
    try {
      const res = await displayFetch(SESSION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        requestTimerRefresh();
        onClose();
        return;
      }
    } catch {
      // Said below; the sheet stays so the tap can be tried again.
    }
    setBusy(false);
    setConfirm(null);
    setStartFailed(true);
  }, [displayId, hasDisplayList, live, onClose]);

  const choose = useCallback(async (choice: Choice) => {
    if (busy) return;
    try {
      const res = await displayFetch(SESSION_URL);
      if (res.ok) {
        const { session } = (await res.json()) as { session: TimerSession | null };
        if (materializeSession(session, Date.now())?.status === 'running') {
          setConfirm(choice);
          return;
        }
      }
    } catch {
      // Unknown: start anyway, the same as an empty house.
    }
    void start(choice);
  }, [busy, start]);

  const tile: CSSProperties = {
    background: C.tile,
    border: `${P(2)}px solid ${C.edge}`,
    borderRadius: P(30),
    color: '#fff',
    fontFamily: 'inherit',
    cursor: 'pointer',
  };
  const section: CSSProperties = {
    marginTop: P(44),
    fontSize: P(28),
    fontWeight: 650,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: C.muted,
  };
  const note: CSSProperties = { marginTop: P(18), fontSize: P(32), lineHeight: 1.35, color: C.muted };

  return (
    <WallOverlay
      label={t('display-control.timers')}
      testId="timers-sheet"
      onClose={onClose}
      autoCloseMs={TIMERS_SHEET_AUTO_CLOSE_MS}
      scrim="rgba(0,0,0,0.58)"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute', left: '50%', bottom: 0, transform: 'translateX(-50%)',
          // A wide wall puts the routines and the quick lengths side by side,
          // so the quick ones never sit below a scroll nobody knows is there.
          width: `min(100%, ${P(landscape ? 1640 : 900)}px)`, maxHeight: '92%', display: 'flex', flexDirection: 'column',
          background: C.surface, color: '#fff', cursor: 'default',
          border: `${P(2)}px solid ${C.edge}`, borderBottom: 0, borderRadius: `${P(48)}px ${P(48)}px 0 0`,
          boxShadow: '0 -20px 60px rgba(0,0,0,0.5)', overflow: 'hidden',
          animation: 'wall-sheet-in 250ms ease-out',
        }}
      >
        <div style={{ width: P(96), height: P(8), borderRadius: P(4), background: 'rgba(255,255,255,0.22)', margin: `${P(22)}px auto 0`, flexShrink: 0 }} />
        <div style={{ height: P(10), marginTop: P(28), background: C.accent, flexShrink: 0 }} />
        <div style={{ padding: `0 ${P(56)}px`, flexShrink: 0 }}>
          <div style={{ marginTop: P(54), fontSize: P(30), fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: C.faint }}>
            {t('display-control.timersEyebrow')}
          </div>
          <div style={{ marginTop: P(6), fontSize: P(84), fontWeight: 750, letterSpacing: '-0.02em', lineHeight: 1.05 }}>
            {t('display-control.timers')}
          </div>
          {!live && <p data-testid="timers-sheet-preview-note" style={note}>{t('display-control.timersPreview')}</p>}
        </div>

        <div
          className="wall-sheet-panel"
          style={{
            flex: '1 1 auto', minHeight: 0, overflowY: 'auto', scrollbarWidth: 'none', padding: `0 ${P(56)}px ${P(10)}px`,
            ...(landscape ? { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', columnGap: P(48), alignItems: 'start' } : {}),
          }}
        >
          <div>
            <div style={section}>{t('display-control.routines')}</div>
            {routines?.map((routine) => (
              <button
                key={routine.id}
                type="button"
                {...wallPress('flex items-center text-left')}
                data-testid="timers-sheet-routine"
                onClick={() => void choose({ kind: 'routine', routine })}
                style={{ ...tile, width: '100%', height: P(132), marginTop: P(18), padding: `0 ${P(22)}px`, gap: P(26) }}
              >
                <span style={{ width: P(92), height: P(92), borderRadius: P(24), background: 'rgba(45,212,191,0.13)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: P(54), flexShrink: 0 }}>
                  <Glyph value={routine.icon ?? '⏱️'} fallback="⏱️" />
                </span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: 'block', fontSize: P(46), fontWeight: 650, lineHeight: 1.1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{routine.name}</span>
                  <span style={{ display: 'block', marginTop: P(4), fontSize: P(30), color: C.muted }}>
                    {tc('timer.routineMeta', {
                      count: routine.steps.length,
                      steps: routine.steps.length,
                      minutes: Math.round(routineTotalSec(routine) / 60),
                    })}
                  </span>
                </span>
                <span aria-hidden="true" style={{ width: P(88), height: P(88), borderRadius: '50%', background: C.go, color: C.goInk, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Play fill="currentColor" strokeWidth={0} style={{ width: P(40), height: P(40), marginLeft: P(6) }} />
                </span>
              </button>
            ))}
            {routines?.length === 0 && <p style={note}>{t('display-control.noRoutines')}</p>}
            {loadFailed && <p style={note}>{tc('timer.routinesLoadError')}</p>}
          </div>

          <div>
            <div style={section}>{t('display-control.quickTimer')}</div>
            <div style={{ marginTop: P(18), display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: P(18) }}>
              {QUICK_TIMER_PRESETS_SEC.map((sec) => (
                <button
                  key={sec}
                  type="button"
                  {...wallPress()}
                  data-testid="timers-sheet-quick"
                  onClick={() => void choose({ kind: 'quick', durationSec: sec })}
                  style={{ ...tile, height: P(112), fontSize: P(44), fontWeight: 700 }}
                >
                  {sec < 60 ? tc('timer.secondsShort', { seconds: sec }) : tc('timer.minutesShort', { minutes: sec / 60 })}
                </button>
              ))}
          </div>
          {startFailed && <p role="status" style={{ ...note, color: '#fca5a5' }}>{t('display-control.timerStartFailed')}</p>}
          </div>
        </div>

        <button
          type="button"
          {...wallPress()}
          onClick={onClose}
          style={{ ...tile, flexShrink: 0, margin: `${P(16)}px ${P(56)}px ${P(26)}px`, height: P(104), fontSize: P(40), fontWeight: 650, background: 'rgba(255,255,255,0.09)' }}
        >
          {tc('actions.close')}
        </button>
      </div>

      {confirm && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            setConfirm(null);
          }}
          style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)' }}
        >
          <div
            role="alertdialog"
            aria-label={tc('timer.replaceTitle')}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
              width: `min(calc(100% - ${P(140)}px), ${P(860)}px)`, padding: P(56),
              background: C.surface, border: `${P(2)}px solid rgba(255,255,255,0.10)`, borderRadius: P(44),
              boxShadow: '0 30px 80px rgba(0,0,0,0.6)', color: '#fff', cursor: 'default',
              animation: 'wall-card-in 250ms ease-out',
            }}
          >
            <div style={{ fontSize: P(54), fontWeight: 750, letterSpacing: '-0.02em', lineHeight: 1.1 }}>{tc('timer.replaceTitle')}</div>
            <p style={{ marginTop: P(22), fontSize: P(36), lineHeight: 1.35, color: 'rgba(255,255,255,0.7)' }}>{tc('timer.replaceBody')}</p>
            <div style={{ display: 'flex', gap: P(20), marginTop: P(44) }}>
              <button
                type="button"
                {...wallPress()}
                onClick={() => setConfirm(null)}
                style={{ ...tile, flex: 1, height: P(112), fontSize: P(38), fontWeight: 700, background: 'rgba(255,255,255,0.09)' }}
              >
                {tc('actions.cancel')}
              </button>
              <button
                type="button"
                {...wallPress()}
                data-testid="timers-sheet-replace"
                disabled={busy}
                onClick={() => void start(confirm)}
                style={{ ...tile, flex: 1, height: P(112), fontSize: P(38), fontWeight: 700, background: C.go, borderColor: C.go, color: C.goInk }}
              >
                {t('display-control.start')}
              </button>
            </div>
          </div>
        </div>
      )}
    </WallOverlay>
  );
}
