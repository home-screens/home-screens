'use client';

import React from 'react';
import type { ChoreMember } from '@/types/config';
import { useTranslate } from '@/i18n';

interface MemberPickerProps {
  members: ChoreMember[];
  balances: Record<string, number>;
  selectedId: string | null;
  onSelect: (memberId: string) => void;
  scale: number;
}

export default function MemberPicker({
  members,
  balances,
  selectedId,
  onSelect,
  scale,
}: MemberPickerProps) {
  const avatarSize = scale * 3.2;
  const nameFontSize = scale * 0.9;
  const balanceFontSize = scale * 0.85;
  const gap = scale * 0.8;
  const padding = `${scale * 0.6}px ${scale * 0.8}px`;
  const borderRadius = scale * 0.8;
  const t = useTranslate('modules');

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap,
        justifyContent: 'center',
      }}
    >
      {members.map((member) => {
        const isSelected = member.id === selectedId;
        const balance = balances[member.id] ?? 0;

        return (
          <button
            key={member.id}
            onClick={() => onSelect(member.id)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: scale * 0.3,
              padding,
              borderRadius,
              border: isSelected
                ? `${scale * 0.15}px solid var(--fcc-accent)`
                : `${scale * 0.1}px solid var(--fcc-border)`,
              background: isSelected
                ? 'color-mix(in srgb, var(--fcc-accent) 12%, var(--fcc-surface))'
                : 'var(--fcc-surface)',
              cursor: 'pointer',
              transition: 'border-color 0.15s, background 0.15s',
              outline: 'none',
            }}
          >
            <div
              style={{
                width: avatarSize,
                height: avatarSize,
                borderRadius: '50%',
                background: member.color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                fontSize: avatarSize * 0.45,
                fontWeight: 700,
                color: 'white',
              }}
            >
              {member.name.charAt(0).toUpperCase()}
            </div>

            <div
              style={{
                fontSize: nameFontSize,
                fontWeight: 600,
                color: 'var(--fcc-text)',
                whiteSpace: 'nowrap',
              }}
            >
              {member.name}
            </div>

            <div
              style={{
                fontSize: balanceFontSize,
                fontWeight: 700,
                color: 'var(--fcc-accent)',
              }}
            >
              {t('fullscreen-chore-chart.rewardsStore.balanceCount', { count: balance })}
            </div>
          </button>
        );
      })}
    </div>
  );
}
