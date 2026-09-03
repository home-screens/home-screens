'use client';

import React from 'react';
import { Ticket } from 'lucide-react';
import type { ChoreMember } from '@/types/config';
import { onAccentFor } from '@/lib/fullscreen-themes';

interface MemberPickerProps {
  members: ChoreMember[];
  balances: Record<string, number>;
  selectedId: string | null;
  onSelect: (memberId: string) => void;
  k: number;
  t: number;
  d: number;
  /** Where the chips line up: the title's left edge in portrait, or centred. */
  justify?: 'flex-start' | 'center';
}

/**
 * One compact chip per member: avatar, name, ticket balance. Horizontal so
 * eight members wrap into two rows instead of a wall of tall tiles. The
 * balance sits in the secondary text colour; the accent is kept for the
 * selected border so the picked kid is the only highlighted thing.
 */
export default function MemberPicker({ members, balances, selectedId, onSelect, k, t, d, justify = 'flex-start' }: MemberPickerProps) {
  const nameSize = 24 * t;
  const avatar = Math.max(44 * k, nameSize * 1.7);
  const balanceSize = 20 * t;
  const border = Math.max(2, 3 * k);

  return (
    <div
      data-testid="fcc-store-picker"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 12 * k * d,
        justifyContent: justify,
      }}
    >
      {members.map((member) => {
        const isSelected = member.id === selectedId;
        const balance = balances[member.id] ?? 0;

        return (
          <button
            key={member.id}
            data-testid="fcc-store-chip"
            onClick={() => onSelect(member.id)}
            aria-pressed={isSelected}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10 * k * d,
              padding: `${6 * k * d}px ${18 * k * d}px ${6 * k * d}px ${6 * k * d}px`,
              minHeight: 44 * k,
              borderRadius: 999,
              border: `${border}px solid ${isSelected ? 'var(--fcc-accent)' : 'var(--fcc-border)'}`,
              background: isSelected
                ? 'color-mix(in srgb, var(--fcc-accent) 12%, var(--fcc-surface))'
                : 'var(--fcc-surface)',
              boxShadow: 'var(--fcc-card-shadow)',
              cursor: 'pointer',
              transition: 'border-color 0.15s, background 0.15s',
              outline: 'none',
              fontFamily: 'inherit',
              color: 'var(--fcc-text)',
            }}
          >
            <span
              style={{
                width: avatar,
                height: avatar,
                borderRadius: '50%',
                background: member.color,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                fontSize: avatar * 0.46,
                fontWeight: 700,
                lineHeight: 1,
                color: onAccentFor(member.color),
              }}
            >
              {member.name.charAt(0).toUpperCase()}
            </span>

            <span style={{ fontSize: nameSize, fontWeight: 700, lineHeight: 1.1, whiteSpace: 'nowrap' }}>
              {member.name}
            </span>

            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4 * k,
                fontSize: balanceSize,
                fontWeight: 600,
                lineHeight: 1,
                color: 'var(--fcc-text-2)',
                whiteSpace: 'nowrap',
              }}
            >
              <Ticket size={balanceSize} strokeWidth={2} aria-hidden="true" />
              {balance}
            </span>
          </button>
        );
      })}
    </div>
  );
}
