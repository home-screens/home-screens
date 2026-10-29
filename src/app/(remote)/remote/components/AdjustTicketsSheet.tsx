'use client';

import { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import type { FamilyMember } from '@/types/family';
import { useFormattingLocale, useTranslate } from '@/i18n';
import BottomSheet from './BottomSheet';
import { INPUT_STYLE } from './chore-form-styles';

/** The most a reason may say; the hub cuts it here too. */
export const REASON_MAX_CHARS = 80;
/** Past this many names the button counts people instead of naming them. */
const NAMED_LIMIT = 3;

/**
 * A grown-up gives or takes tickets by hand: several people at once, the
 * same amount each, with a reason that lands in their ticket history. The
 * sheet opens with nobody picked, shows each person's balance on their chip,
 * and the button reads back exactly what will happen so nobody takes when
 * they meant to give, or from the wrong child.
 */
export default function AdjustTicketsSheet({
  members,
  balances,
  onSubmit,
  onClose,
}: {
  members: FamilyMember[];
  /** Each person's tickets, shown on their chip: taking is capped at what they have. */
  balances: Record<string, number>;
  onSubmit: (memberIds: string[], amount: number, reason: string) => Promise<void> | void;
  onClose: () => void;
}) {
  const t = useTranslate('remote');
  const locale = useFormattingLocale();
  // In the order picked: the parent who tapped Dax first looks for Dax first.
  const [picked, setPicked] = useState<string[]>([]);
  const [amount, setAmount] = useState(1);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  // A pasted reason longer than the box was cut: said once, under the box.
  const [trimmed, setTrimmed] = useState(false);

  const togglePicked = (id: string) => setPicked((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  const pickedMembers = picked.map((id) => members.find((m) => m.id === id)).filter((m): m is FamilyMember => !!m);
  const count = pickedMembers.length;
  const magnitude = Math.abs(amount);
  const giving = amount > 0;
  const tickets = (n: number) => (n === 1 ? t('rewardsView.ticketCountSingular', { n }) : t('rewardsView.ticketCountPlural', { n }));
  const names = count <= NAMED_LIMIT
    ? new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(pickedMembers.map((m) => m.name))
    : t('rewardsView.adjust.manyPeople', { count });
  // Taking more than someone has takes what they have: say so before the tap.
  // Someone with nothing has nothing to take, so with only such people picked
  // the button says so and stays off.
  const empty = !giving ? pickedMembers.filter((m) => (balances[m.id] ?? 0) <= 0) : [];
  const nothingToTake = !giving && count > 0 && empty.length === count;
  const short = !giving ? pickedMembers.filter((m) => (balances[m.id] ?? 0) > 0 && (balances[m.id] ?? 0) < magnitude) : [];
  const shortLine = nothingToTake
    ? null
    : short.length === 0
      ? null
      : short.length === 1
        ? t('rewardsView.adjust.shortOne', { name: short[0].name, n: balances[short[0].id] ?? 0 })
        : t('rewardsView.adjust.shortMany', { names: new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(short.map((m) => m.name)) });
  const canSubmit = count > 0 && amount !== 0 && !busy && !nothingToTake;
  const label = count === 0
    ? t('rewardsView.adjust.pickSomeone')
    : amount === 0
      ? t('rewardsView.adjust.chooseHowMany')
      : nothingToTake
        ? t('rewardsView.adjust.nothingToTake', { names })
        : t(giving ? 'rewardsView.adjust.give' : 'rewardsView.adjust.take', { amount: tickets(magnitude), names });

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      await onSubmit(picked, amount, reason.trim());
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const stepButton = (delta: number, icon: React.ReactNode, ariaLabel: string) => (
    <button
      type="button"
      className="press-scale-xs"
      onClick={() => setAmount((a) => Math.max(-99, Math.min(99, a + delta)))}
      aria-label={ariaLabel}
      style={{ width: 48, height: 48, borderRadius: 12, border: '1px solid var(--hs-border)', background: 'var(--hs-bg-card)', color: 'var(--hs-text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
    >
      {icon}
    </button>
  );

  return (
    <BottomSheet title={t('rewardsView.adjust.title')} onClose={onClose} testId="adjust-tickets-sheet">
      <p style={{ margin: '-6px 0 12px', fontSize: 13, color: 'var(--hs-text-muted)', lineHeight: 1.4 }}>{t('rewardsView.adjust.hint')}</p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 14 }}>
        {members.map((member) => {
          const on = picked.includes(member.id);
          return (
            <button
              key={member.id}
              type="button"
              className="press-scale"
              onClick={() => togglePicked(member.id)}
              aria-pressed={on}
              data-testid={`adjust-member-${member.id}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', minHeight: 44, borderRadius: 999,
                border: `2px solid ${on ? member.color : 'transparent'}`,
                background: on ? `color-mix(in srgb, ${member.color} 15%, transparent)` : 'var(--hs-bg-card)',
                color: on ? 'var(--hs-text-primary)' : 'var(--hs-text-muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}
            >
              <span style={{ width: 18, height: 18, borderRadius: '50%', background: member.color, color: 'white', fontSize: 10, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{member.name[0]}</span>
              {member.name}
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--hs-text-faint)', fontVariantNumeric: 'tabular-nums' }}>· {balances[member.id] ?? 0}</span>
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        {stepButton(-1, <Minus size={20} />, t('rewardsView.adjust.less'))}
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div data-testid="adjust-amount" style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.02em', color: giving ? 'var(--hs-success)' : amount < 0 ? 'var(--hs-danger)' : 'var(--hs-text-faint)', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
            {amount > 0 ? `+${amount}` : amount}
          </div>
          <div style={{ fontSize: 12, color: 'var(--hs-text-faint)', fontWeight: 500 }}>{t(count > 1 ? 'rewardsView.adjust.eachLabel' : 'rewardsView.adjust.ticketsLabel', { count: magnitude })}</div>
        </div>
        {stepButton(1, <Plus size={20} />, t('rewardsView.adjust.more'))}
      </div>
      {shortLine && (
        <p data-testid="adjust-short" style={{ margin: '-4px 2px 12px', fontSize: 12.5, color: 'var(--hs-text-muted)', lineHeight: 1.4 }}>{shortLine}</p>
      )}

      <input
        type="text"
        data-testid="adjust-reason"
        value={reason}
        onChange={(e) => {
          setTrimmed(e.target.value.length > REASON_MAX_CHARS);
          setReason(e.target.value.slice(0, REASON_MAX_CHARS));
        }}
        placeholder={t('rewardsView.adjust.reasonPlaceholder')}
        maxLength={REASON_MAX_CHARS}
        style={INPUT_STYLE}
      />
      <p style={{ margin: '6px 2px 14px', fontSize: 12, color: 'var(--hs-text-faint)', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <span>{trimmed ? t('rewardsView.adjust.reasonTrimmed', { max: REASON_MAX_CHARS }) : t('rewardsView.adjust.reasonHint')}</span>
        {/* A counter once the line is getting long: the box stops at 80 and would otherwise do so silently. */}
        {reason.length >= REASON_MAX_CHARS - 20 && (
          <span data-testid="adjust-reason-count" style={{ fontVariantNumeric: 'tabular-nums', color: reason.length >= REASON_MAX_CHARS ? 'var(--hs-danger)' : undefined }}>
            {reason.length}/{REASON_MAX_CHARS}
          </span>
        )}
      </p>

      <button
        type="button"
        data-testid="adjust-submit"
        className="press-scale"
        disabled={!canSubmit}
        onClick={() => void submit()}
        style={{
          width: '100%', minHeight: 50, borderRadius: 14, border: 'none', fontSize: 15, fontWeight: 700, cursor: canSubmit ? 'pointer' : 'default',
          background: canSubmit ? (giving ? 'var(--hs-success)' : 'var(--hs-danger)') : 'var(--hs-bg-card)',
          color: canSubmit ? '#111' : 'var(--hs-text-faint)',
        }}
      >
        {label}
      </button>
    </BottomSheet>
  );
}
