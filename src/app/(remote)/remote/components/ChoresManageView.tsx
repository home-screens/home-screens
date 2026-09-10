'use client';

import { useState } from 'react';
import { ChevronRight, Plus } from 'lucide-react';
import type { FamilyMember } from '@/types/family';
import type { ChoreDefinition } from '@/types/config';
import {
  addChoreToList,
  updateChoreInList,
  removeChoreFromList,
} from '@/components/modules/chore-chart/types';
import ChoreIcon from '@/components/modules/chore-chart/ChoreIcon';
import { useTranslate } from '@/i18n';
import { buildChoreSummaryLine } from '@/components/modules/chore-chart/chore-form-presentation';
import { DEFAULT_CHORE_ICON } from '@/lib/chore-constants';
import FamilyManager from '@/components/family/FamilyManager';
import ChoreFormOverlay from './ChoreFormOverlay';

// ── Main Exported Component ───────────────────────────────────────

interface ChoresManageViewProps {
  members: FamilyMember[];
  chores: ChoreDefinition[];
  onFamilyChanged: () => void;
  onChoresChange: (chores: ChoreDefinition[]) => void;
}

export default function ChoresManageView({
  members,
  chores,
  onFamilyChanged,
  onChoresChange,
}: ChoresManageViewProps) {
  const t = useTranslate('remote');
  const tModules = useTranslate('modules');
  const [section, setSection] = useState<'members' | 'chores'>('chores');
  const [overlay, setOverlay] = useState<
    | { type: 'chore-form'; chore?: ChoreDefinition }
    | null
  >(null);

  // ── CRUD helpers ──

  const addChore = (data: Omit<ChoreDefinition, 'id'>) => {
    onChoresChange(addChoreToList(chores, data));
    setOverlay(null);
  };

  const updateChore = (id: string, data: Omit<ChoreDefinition, 'id'>) => {
    onChoresChange(updateChoreInList(chores, id, data));
    setOverlay(null);
  };

  const deleteChore = (id: string) => {
    onChoresChange(removeChoreFromList(chores, id));
    setOverlay(null);
  };

  return (
    <div>
      {/* Inner tabs: Members / Chores */}
      <div
        style={{
          display: 'flex',
          gap: 2,
          padding: 3,
          background: 'var(--hs-bg-card)',
          borderRadius: 10,
          marginBottom: 16,
        }}
      >
        {(['chores', 'members'] as const).map((tab) => {
          const isActive = section === tab;
          const count = tab === 'members' ? members.length : chores.length;
          return (
            <button
              key={tab}
              onClick={() => setSection(tab)}
              style={{
                flex: 1,
                padding: '8px 12px',
                minHeight: 40,
                fontSize: 13,
                fontWeight: 600,
                borderRadius: 8,
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.15s',
                background: isActive ? 'var(--hs-bg-hover)' : 'transparent',
                color: isActive ? 'var(--hs-text-body)' : 'var(--hs-text-faint)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              {t(`choresManage.tabs.${tab}`)}
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: 20,
                  height: 20,
                  padding: '0 6px',
                  borderRadius: 999,
                  background: 'var(--hs-bg-hover)',
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {section === 'members' && <FamilyManager variant="mobile" chores={chores} onChanged={onFamilyChanged} />}

      {section === 'chores' && (
        <div>
          {chores.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 16px' }}>
              <p style={{ fontSize: 14, color: 'var(--hs-text-faint)', marginBottom: 4 }}>
                {t('choresManage.chores.empty')}
              </p>
              {members.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--hs-text-faint)' }}>
                  {t('choresManage.chores.emptyHintNoMembers')}
                </p>
              ) : (
                <p style={{ fontSize: 12, color: 'var(--hs-text-faint)' }}>
                  {t('choresManage.chores.emptyHintAddChores')}
                </p>
              )}
            </div>
          )}

          {chores.map((chore) => {
            let rotationLabel: string | null = null;
            if ((chore.rotation !== 'fixed' && chore.assigneeIds.length > 1) || chore.rotation === 'schedule') {
              if (chore.rotation === 'rotate-daily') rotationLabel = tModules('chore-chart.choreSummary.rotationDaily');
              else if (chore.rotation === 'rotate-weekly') rotationLabel = tModules('chore-chart.choreSummary.rotationWeekly');
              else rotationLabel = tModules('chore-chart.choreSummary.rotationSchedule');
            }
            return (
              <button
                key={chore.id}
                className="press-scale"
                aria-label={t('choresManage.chores.editAriaLabel', { name: chore.name })}
                onClick={() => setOverlay({ type: 'chore-form', chore })}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '14px 16px',
                  background: 'var(--hs-bg-card)',
                  borderRadius: 14,
                  marginBottom: 8,
                  border: '1px solid transparent',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  textAlign: 'left' as const,
                  color: 'inherit',
                }}
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    background: 'var(--hs-bg-hover)',
                  }}
                >
                  <ChoreIcon
                    value={chore.emoji || DEFAULT_CHORE_ICON}
                    size={20}
                    color="var(--hs-text-muted)"
                  />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--hs-text-body)' }}>{chore.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--hs-text-faint)', marginTop: 2 }}>
                    {buildChoreSummaryLine({ chore, t: tModules })}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--hs-text-faint)', marginTop: 2 }}>
                    &rarr;{' '}
                    {chore.assigneeIds
                      .map((id) => members.find((m) => m.id === id)?.name ?? tModules('chore-chart.unknownAssignee'))
                      .join(', ')}
                    {rotationLabel && (
                      <span> ({rotationLabel})</span>
                    )}
                  </div>
                </div>
                <ChevronRight size={20} color="var(--hs-text-faint)" style={{ flexShrink: 0 }} />
              </button>
            );
          })}

          <button
            className="press-scale"
            onClick={() => {
              if (members.length === 0) { setSection('members'); return; }
              setOverlay({ type: 'chore-form' });
            }}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: 14,
              minHeight: 48,
              borderRadius: 14,
              border: '2px dashed var(--hs-border)',
              color: members.length === 0 ? 'var(--hs-border-strong)' : 'var(--hs-text-faint)',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s',
              marginTop: 4,
              background: 'none',
            }}
          >
            <Plus size={18} />
            {t('choresManage.chores.addButton')}
          </button>
        </div>
      )}

      {/* ── Overlays ── */}

      {overlay?.type === 'chore-form' && (
        <ChoreFormOverlay
          key={overlay.chore?.id ?? 'new'}
          initial={overlay.chore}
          members={members}
          onSubmit={(data) =>
            overlay.chore
              ? updateChore(overlay.chore.id, data)
              : addChore(data)
          }
          onDelete={
            overlay.chore
              ? () => deleteChore(overlay.chore!.id)
              : undefined
          }
          onBack={() => setOverlay(null)}
        />
      )}
    </div>
  );
}
