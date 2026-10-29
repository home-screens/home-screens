'use client';

import { useEffect, useState } from 'react';
import type { FamilyMember } from '@/types/family';
import type { TicketLedgerRow, TicketLedgerSummary } from '@/lib/reward-history';
import { groupTicketLedgerByDay } from '@/lib/reward-history';
import { editorFetch } from '@/lib/editor-fetch';
import { formatTimeAgoLocalized } from '@/lib/chore-constants';
import { useTranslate } from '@/i18n';
import { useHouseholdNow } from '../household-clock';
import ChoreIcon from '@/components/modules/chore-chart/ChoreIcon';

interface LedgerAnswer {
  rows: TicketLedgerRow[];
  summary: TicketLedgerSummary;
}

/**
 * One person's ticket history: the thirty-day totals, then every move
 * newest first in the day groups the wall uses. Earned in green, spent in
 * grey, a grown-up's adjustment in amber with the reason under it.
 *
 * Read from the hub whenever the person or the balances change (`version`),
 * so a tick on the Today tab shows up here without a reload.
 */
export default function TicketsFeed({
  members,
  memberId,
  onSelectMember,
  showMemberPicker,
  isAdmin = false,
  timeZone,
  version,
}: {
  members: FamilyMember[];
  memberId: string;
  onSelectMember: (id: string) => void;
  /** Grown-ups pick whose history to read; a kid sees their own. */
  showMemberPicker: boolean;
  /** On the grown-up's own phone the rows speak of the grown-up, not "a grown-up". */
  isAdmin?: boolean;
  timeZone?: string;
  /** Anything whose change means the feed may have moved: the balances object is the natural one. */
  version: unknown;
}) {
  const t = useTranslate('remote');
  const tCore = useTranslate('core');
  const now = useHouseholdNow();
  const [answer, setAnswer] = useState<LedgerAnswer | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    const controller = new AbortController();
    (async () => {
      try {
        const res = await editorFetch(`/api/rewards/ledger?member=${encodeURIComponent(memberId)}`, { signal: controller.signal });
        if (!live) return;
        if (!res.ok) { setFailed(true); return; }
        setAnswer(await res.json() as LedgerAnswer);
        setFailed(false);
      } catch {
        if (live) setFailed(true);
      }
    })();
    return () => { live = false; controller.abort(); };
  }, [memberId, version]);

  const member = members.find((m) => m.id === memberId);
  const color = member?.color ?? 'var(--hs-text-muted)';
  const groups = answer ? groupTicketLedgerByDay(answer.rows, now, timeZone) : [];

  const deltaStyle = (row: TicketLedgerRow): { color: string; text: string } => {
    if (row.delta === null) return { color: 'var(--hs-text-faint)', text: '·' };
    // A real minus sign, as on the tiles above, not a hyphen; a free reward is a plain 0.
    const text = row.delta > 0 ? `+${row.delta}` : row.delta < 0 ? `\u2212${-row.delta}` : '0';
    if (row.kind === 'earned') return { color: 'var(--hs-success)', text };
    if (row.kind === 'spent') return { color: 'var(--hs-text-faint)', text };
    return { color: '#fbbf24', text };
  };
  const titleOf = (row: TicketLedgerRow): string => {
    if (row.title) return row.title;
    if (row.kind === 'earned') return t('rewardsView.tickets.removedChore');
    const took = row.delta !== null && row.delta < 0;
    if (isAdmin) return t(took ? 'rewardsView.tickets.tookAdmin' : 'rewardsView.tickets.gaveAdmin');
    return t(took ? 'rewardsView.tickets.tookOne' : 'rewardsView.tickets.gaveSome');
  };
  const subtitleOf = (row: TicketLedgerRow): string | null => {
    if (row.kind === 'spent') return t('rewardsView.tickets.rewardLine');
    if (row.kind === 'earned') return row.bonus ? t('rewardsView.tickets.bonusLine') : null;
    return row.title ? t('rewardsView.tickets.grownUpLine') : null;
  };

  return (
    <div data-testid="tickets-feed">
      {showMemberPicker && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '4px 0 12px' }}>
          {members.map((m) => {
            const isActive = m.id === memberId;
            return (
              <button
                key={m.id}
                className="press-scale"
                onClick={() => onSelectMember(m.id)}
                aria-pressed={isActive}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', minHeight: 44, borderRadius: 999,
                  border: `2px solid ${isActive ? m.color : 'transparent'}`,
                  background: isActive ? `color-mix(in srgb, ${m.color} 15%, transparent)` : 'var(--hs-bg-card)',
                  color: isActive ? m.color : 'var(--hs-text-muted)', fontSize: 13, fontWeight: 500, cursor: 'pointer', flexShrink: 0, maxWidth: '100%',
                }}
              >
                {m.emoji ? (
                  <span style={{ flexShrink: 0, display: 'inline-flex' }}>
                    <ChoreIcon value={m.emoji} size={18} color={isActive ? m.color : 'var(--hs-text-muted)'} fallback={<span style={{ fontSize: 16, fontWeight: 600 }}>{m.name[0]}</span>} />
                  </span>
                ) : (
                  <span style={{ fontSize: 16, fontWeight: 600, flexShrink: 0 }}>{m.name[0]}</span>
                )}
                <span style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
              </button>
            );
          })}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 6 }}>
        {/* No sign on a zero: "−0 spent" reads as a bug. */}
        {([
          ['earned', answer ? (answer.summary.earned > 0 ? `+${answer.summary.earned}` : '0') : '', 'var(--hs-success)'],
          ['spent', answer ? (answer.summary.spent > 0 ? `\u2212${answer.summary.spent}` : '0') : '', 'var(--hs-text-muted)'],
          ['adjusted', answer ? (answer.summary.adjusted > 0 ? `+${answer.summary.adjusted}` : answer.summary.adjusted < 0 ? `\u2212${-answer.summary.adjusted}` : '0') : '', '#fbbf24'],
        ] as const).map(([key, value, tileColor]) => (
          <div key={key} data-testid={`tickets-tile-${key}`} style={{ background: 'var(--hs-bg-card)', borderRadius: 14, padding: '12px 12px 10px', textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', color: tileColor, fontVariantNumeric: 'tabular-nums', minHeight: 27 }}>{value || ' '}</div>
            <div style={{ fontSize: 11, color: 'var(--hs-text-faint)', fontWeight: 500 }}>{t(`rewardsView.tickets.${key}`)}</div>
          </div>
        ))}
      </div>
      <p style={{ margin: '0 2px 4px', fontSize: 12, color: 'var(--hs-text-faint)' }}>{t('rewardsView.tickets.window')}</p>

      {failed && !answer && (
        <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--hs-text-faint)', fontSize: 14 }}>{t('rewardsView.tickets.failed')}</div>
      )}
      {answer && answer.rows.length === 0 && (
        <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--hs-text-faint)', fontSize: 14 }}>{t('rewardsView.tickets.empty')}</div>
      )}

      {groups.map((group) => (
        <div key={group.bucket}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--hs-text-faint)', padding: '12px 0 6px' }}>
            {t(`rewardsView.tickets.bucket.${group.bucket}`)}
          </div>
          {group.rows.map((row) => {
            const delta = deltaStyle(row);
            const subtitle = subtitleOf(row);
            const removed = row.kind === 'earned' && row.title === null;
            return (
              <div key={row.id} data-testid="tickets-row" data-kind={row.kind} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--hs-bg-card)' }}>
                <div style={{ width: 44, textAlign: 'right', flexShrink: 0, fontSize: 14, fontWeight: 700, color: delta.color, fontVariantNumeric: 'tabular-nums' }}>{delta.text}</div>
                <div style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: removed ? 'var(--hs-text-faint)' : 'var(--hs-text-body)', textDecoration: removed ? 'line-through' : 'none' }}>
                  <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{titleOf(row)}</div>
                  {subtitle && <div style={{ fontSize: 12, color: 'var(--hs-text-faint)', textDecoration: 'none' }}>{subtitle}</div>}
                </div>
                <div style={{ fontSize: 11, color: 'var(--hs-text-faint)', flexShrink: 0 }}>
                  {row.at ? formatTimeAgoLocalized(row.at, tCore, now) : row.date}
                </div>
              </div>
            );
          })}
        </div>
      ))}
      <span aria-hidden style={{ display: 'none', color }} />
    </div>
  );
}
