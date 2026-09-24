'use client';

import { Fragment, useMemo, useState } from 'react';
import { ChevronRight, Plus } from 'lucide-react';
import type { FamilyGroup, FamilyMember } from '@/types/family';
import type { ChoreDefinition, ChoreSettings } from '@/types/config';
import {
  choreAssigneeIds,
  addChoreToList,
  updateChoreInList,
  removeChoreFromList,
} from '@/components/modules/chore-chart/types';
import ChoreIcon from '@/components/modules/chore-chart/ChoreIcon';
import { useTranslate, useFormattingLocale } from '@/i18n';
import { getLocalizedDayNames } from '@/lib/meal-constants';
import { buildChoreAssigneeLine, buildChoreSummaryLine, getChoreRotationSummaryKey, grabRulesSummary } from '@/components/modules/chore-chart/chore-form-presentation';
import { DEFAULT_CHORE_ICON } from '@/lib/chore-constants';
import FamilyManager from '@/components/family/FamilyManager';
import ChoreFormOverlay from './ChoreFormOverlay';

// ── Main Exported Component ───────────────────────────────────────

interface ChoresManageViewProps {
  members: FamilyMember[];
  groups: FamilyGroup[];
  familyReady: boolean;
  chores: ChoreDefinition[];
  onFamilyChanged: () => void;
  onChoresChange: (chores: ChoreDefinition[]) => void;
  /** The household's grab rules, shown above the bonus chores. */
  choreSettings: ChoreSettings;
  /** Opens the household chore settings (how bonus chores are grabbed). */
  onOpenSettings: () => void;
}

export default function ChoresManageView({
  members,
  groups,
  familyReady,
  chores,
  onFamilyChanged,
  onChoresChange,
  choreSettings,
  onOpenSettings,
}: ChoresManageViewProps) {
  const t = useTranslate('remote');
  const tModules = useTranslate('modules');
  // Day names on a chore row follow the formatting locale, not the UI language.
  const formattingLocale = useFormattingLocale();
  const dayNamesShort = useMemo(() => getLocalizedDayNames(formattingLocale, 'short'), [formattingLocale]);
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

          {/* Bonus chores follow the regular ones under their own heading; the sort is stable. */}
          {[...chores].sort((a, b) => Number(!!a.bonus) - Number(!!b.bonus)).map((chore, i, listed) => {
            const rotationKey = getChoreRotationSummaryKey(chore, groups);
            const rotationLabel = rotationKey ? tModules(rotationKey) : null;
            return (
              <Fragment key={chore.id}>
              {chore.bonus && !listed[i - 1]?.bonus && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#f59e0b', margin: '16px 0 8px' }}>
                    <span aria-hidden>✋</span>{tModules('chore-chart.bonus.heading')}
                  </div>
                  {/* The household's grab rules, where the chores they govern are,
                      saying what they are now. Shown with any bonus chore, so the
                      form's note always has a line to point to. */}
                  <div data-testid="grab-rules" style={{
                    display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 10px', padding: '10px 12px',
                    borderRadius: 12, border: '1px solid var(--hs-border)', background: 'var(--hs-bg-card)',
                  }}>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: 1.35, color: 'var(--hs-text-muted)' }}>
                      <strong style={{ color: 'var(--hs-text-body)', fontWeight: 600 }}>{grabRulesSummary(choreSettings, tModules).limit}</strong>
                      {/* No break before the dot, so it never starts a line. */}
                      {'\u00a0· '}{grabRulesSummary(choreSettings, tModules).hold}
                    </span>
                    <button
                      type="button"
                      className="press-scale"
                      data-testid="open-chore-settings"
                      onClick={onOpenSettings}
                      aria-label={t('choreSettings.changeAriaLabel')}
                      style={{
                        flexShrink: 0, minHeight: 44, padding: '0 16px', borderRadius: 999, border: '1px solid var(--hs-border-strong)',
                        background: 'var(--hs-bg-hover)', color: 'var(--hs-text-body)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                      }}
                    >
                      {tModules('chore-chart.settings.change')}
                    </button>
                  </div>
                </>
              )}
              <button
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
                    background: chore.bonus ? 'color-mix(in srgb, #f59e0b 14%, transparent)' : 'var(--hs-bg-hover)',
                    border: chore.bonus ? '1px dashed color-mix(in srgb, #f59e0b 60%, transparent)' : 'none',
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
                    {buildChoreSummaryLine({ chore, t: tModules, dayNames: dayNamesShort })}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--hs-text-faint)', marginTop: 2 }}>
                    &rarr;{' '}
                    {/* A chore nobody has is a thing to fix, so it does not sit in the same quiet grey. */}
                    <span style={choreAssigneeIds(chore, groups).length === 0 ? { color: 'var(--hs-warning)' } : undefined}>
                      {buildChoreAssigneeLine({ chore, members, groups, unknownLabel: tModules('chore-chart.unknownAssignee'), nobodyLabel: tModules('chore-chart.choreSummary.nobody') })}
                    </span>
                    {rotationLabel && (
                      <span> ({rotationLabel})</span>
                    )}
                  </div>
                </div>
                <ChevronRight size={20} color="var(--hs-text-faint)" style={{ flexShrink: 0 }} />
              </button>
              </Fragment>
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
          groups={groups}
          familyReady={familyReady}
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
