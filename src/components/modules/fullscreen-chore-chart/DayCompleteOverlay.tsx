'use client';

import { useEffect } from 'react';
import { Flame } from 'lucide-react';
import type { FamilyMember } from '@/types/family';
import type { FullscreenChoreCelebration } from '@/types/config';
import ChoreIcon from '@/components/modules/chore-chart/ChoreIcon';
import { CONFETTI } from '@/components/display/timer-views/TimerCelebration';
import { CELEBRATION_MS } from '@/lib/chore-celebration';
import { playTimerSound } from '@/components/display/timer-views/timer-sounds';
import { useFormattingLocale, useTranslate } from '@/i18n';

export interface DayCompleteEvent {
  /** Stable for the card's life: a kid joining the card changes its names, not its key. */
  id: number;
  /** Everyone who finished in the same beat; one card for all of them. */
  members: FamilyMember[];
  /** Chores owed today and how many of them are done (all of them, by now), summed over `members`. */
  done: number;
  total: number;
  /** Tickets the day's finished chores paid, summed over `members`. */
  tickets: number;
  /** Days in a row, for a lone finisher when the chart shows streaks and it is two or more; null hides the tile. */
  streak: number | null;
  /** The weekday, for "Every chore for Saturday is finished". */
  dayName: string;
}

interface DayCompleteOverlayProps {
  event: DayCompleteEvent;
  kind: Exclude<FullscreenChoreCelebration, 'off'>;
  /** The chart's chrome scale (`k`) and type scale (`tc`). */
  k: number;
  tc: number;
  sound: boolean;
  /** `all` is true for a tap, which clears whatever else is waiting; the timer takes one card. */
  onDone: (all: boolean) => void;
}

/** Big gets twice the pieces at a larger size, so it feels bigger than the card. */
const BIG_CONFETTI = [
  ...CONFETTI,
  ...CONFETTI.map(([top, leftPct, w, h, color, rotate]) => [top + 90, (leftPct + 47) % 100, w, h, color, -rotate] as const),
] as const;

/**
 * The moment someone finishes every chore they owe today. An event overlay:
 * mounted when the day finishes, gone when its timer runs out or it is
 * tapped, so a chart that rotates underneath never animates it in or out.
 * `simple` is a card over the dimmed chart; `big` takes the whole screen in
 * the person's color, laid out like a finished routine.
 */
export default function DayCompleteOverlay({ event, kind, k, tc, sound, onDone }: DayCompleteOverlayProps) {
  const t = useTranslate('modules');
  const locale = useFormattingLocale();
  const { members } = event;
  const lead = members[0];
  const names = new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(members.map((m) => m.name));

  useEffect(() => {
    const id = setTimeout(() => onDone(false), CELEBRATION_MS);
    return () => clearTimeout(id);
  }, [onDone, event]);

  // A chime only when the setting says so: the kitchen wall is quiet by default.
  // Once per card: a kid joining the card already up does not ring it again.
  useEffect(() => {
    if (sound) playTimerSound('done');
  }, [sound, lead.id]);

  const confetti = (pieces: typeof CONFETTI | typeof BIG_CONFETTI, scale: number) => pieces.map(([top, leftPct, w, h, color, rotate], i) => (
    <div
      key={i}
      aria-hidden="true"
      style={{
        position: 'absolute', top: top * k * 0.55, left: `${leftPct}%`,
        width: w * k * scale, height: h * k * scale, backgroundColor: color, borderRadius: 4 * k,
        ['--hs-confetti-rotate' as string]: `${rotate}deg`,
        animation: `hs-timer-confetti 2.6s ease-in-out ${i * 0.18}s infinite alternate`,
      }}
    />
  ));

  const avatar = (member: FamilyMember, size: number, ring: number, offset = 0) => (
    <div
      key={member.id}
      style={{
        width: size, height: size, borderRadius: '50%', background: member.color, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white',
        boxShadow: `0 0 0 ${ring}px color-mix(in srgb, ${member.color} 22%, transparent)`,
        fontSize: size * 0.45, fontWeight: 800, marginLeft: offset,
      }}
    >
      <ChoreIcon value={member.emoji ?? ''} size={size * 0.55} color="white" bare fallback={null} />
      {!member.emoji && member.name[0]}
    </div>
  );
  // Up to three finishers side by side, overlapping a little past one.
  const avatars = (size: number, ring: number) => (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      {members.slice(0, 3).map((m, i) => avatar(m, size, ring, i === 0 ? 0 : -size * 0.25))}
    </div>
  );

  const shared = {
    'data-testid': 'fcc-day-complete',
    'data-celebration': kind,
    'data-member': members.map((m) => m.id).join(' '),
    role: 'status' as const,
    onClick: () => onDone(true),
  };

  if (kind === 'simple') {
    return (
      <div {...shared} style={{ position: 'absolute', inset: 0, zIndex: 40, overflow: 'hidden', cursor: 'pointer' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(10, 8, 7, 0.62)' }} />
        {confetti(CONFETTI, 1)}
        <div
          className="hs-pop-in"
          style={{
            position: 'absolute', left: 120 * k, right: 120 * k, top: '50%', transform: 'translateY(-50%)',
            background: 'var(--fcc-surface)', color: 'var(--fcc-text)', borderRadius: 40 * k,
            padding: `${56 * k}px ${48 * k}px ${52 * k}px`, textAlign: 'center',
            boxShadow: '0 30px 90px rgba(0,0,0,0.6)',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
          }}
        >
          {avatars(160 * k, 18 * k)}
          <div style={{ marginTop: 28 * k, fontSize: 84 * tc, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.05 }}>
            {t('fullscreen-chore-chart.celebration.allDone', { name: names })}
          </div>
          <div style={{ marginTop: 18 * k, fontSize: 40 * tc, fontWeight: 600, color: 'var(--fcc-text)' }}>
            {t('fullscreen-chore-chart.celebration.summaryChores', { done: event.done, count: event.total })}
            {' · '}
            {t('fullscreen-chore-chart.celebration.summaryTickets', { count: event.tickets })}
          </div>
        </div>
      </div>
    );
  }

  const tile = (value: React.ReactNode, label: string) => (
    <div style={{ padding: `${34 * k}px ${54 * k}px`, borderRadius: 32 * k, backgroundColor: 'rgba(255,255,255,0.06)', border: '2px solid rgba(255,255,255,0.1)', textAlign: 'center' }}>
      <div style={{ fontSize: 64 * tc, fontWeight: 800, color: lead.color, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 * k }}>{value}</div>
      <div style={{ marginTop: 8 * k, fontSize: 28 * tc, fontWeight: 500, color: 'rgba(255,255,255,0.55)' }}>{label}</div>
    </div>
  );

  return (
    <div
      {...shared}
      style={{
        position: 'absolute', inset: 0, zIndex: 40, overflow: 'hidden', cursor: 'pointer', color: '#fff',
        background: `radial-gradient(120% 90% at 50% 30%, color-mix(in srgb, ${lead.color} 28%, #0a0a0a) 0%, color-mix(in srgb, ${lead.color} 16%, #0a0a0a) 55%, #070707 100%)`,
        // Centred on the panel, so a portrait wall does not leave its bottom third empty.
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {confetti(BIG_CONFETTI, 1.4)}
      <div
        className="hs-pop-in"
        style={{
          width: 400 * k, height: 400 * k, borderRadius: '50%', flexShrink: 0,
          backgroundColor: `color-mix(in srgb, ${lead.color} 14%, transparent)`, border: `${8 * k}px solid ${lead.color}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 200 * k, fontWeight: 800, color: lead.color,
          boxShadow: `0 0 ${120 * k}px color-mix(in srgb, ${lead.color} 35%, transparent)`,
        }}
      >
        ✓
      </div>
      <div style={{ marginTop: 90 * k, fontSize: 110 * tc, fontWeight: 800, letterSpacing: '-0.02em', textAlign: 'center', padding: `0 ${40 * k}px` }}>
        {t('fullscreen-chore-chart.celebration.allDone', { name: names })}
      </div>
      <div style={{ marginTop: 24 * k, fontSize: 44 * tc, fontWeight: 500, color: 'rgba(255,255,255,0.6)', maxWidth: '90%', textAlign: 'center' }}>
        {t('fullscreen-chore-chart.celebration.everyChore', { day: event.dayName })}
      </div>
      <div style={{ marginTop: 80 * k, display: 'flex', gap: 32 * k, flexWrap: 'wrap', justifyContent: 'center', padding: `0 ${40 * k}px` }}>
        {tile(event.done, t('fullscreen-chore-chart.celebration.choresDone'))}
        {tile(event.tickets, t('fullscreen-chore-chart.celebration.ticketsToday'))}
        {event.streak !== null && tile(<><Flame size={56 * tc} />{event.streak}</>, t('fullscreen-chore-chart.celebration.dayStreak'))}
      </div>
    </div>
  );
}
