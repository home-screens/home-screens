'use client';

import { Fragment, useMemo, useState } from 'react';
import { ChevronRight, ListChecks, Plus } from 'lucide-react';
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
import { STARTER_CHORE_COUNT } from '@/lib/starter-chores';
import FamilyManager from '@/components/family/FamilyManager';
import ChoreFormOverlay from './ChoreFormOverlay';
import StarterChoresOverlay from './StarterChoresOverlay';
import { REMOTE_ACCENT } from './chore-form-styles';
import { withAlpha } from '@/lib/hex-color';

// ── Main Exported Component ───────────────────────────────────────

interface ChoresManageViewProps {
  members: FamilyMember[];
  groups: FamilyGroup[];
  familyReady: boolean;
  chores: ChoreDefinition[];
  /** The household's day: what a new one-time chore's date starts on. */
  today: string;
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
  today,
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
    | { type: 'starter' }
    | null
  >(null);

  // ── CRUD helpers ──

  const addChore = (data: Omit<ChoreDefinition, 'id'>) => {
    onChoresChange(addChoreToList(chores, data));
    setOverlay(null);
  };

  /** The starter picker's batch: every pick becomes an ordinary chore in one save. */
  const addChores = (batch: Omit<ChoreDefinition, 'id'>[]) => {
    onChoresChange(batch.reduce((list, data) => addChoreToList(list, data), chores));
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
          {/* An empty list opens with the starter list, not a blank page: the
              one button leads to 27 ready-made chores, and "write your own"
              below it is the form. With nobody in the family yet, the same
              card sends people to the Family tab first. */}
          {chores.length === 0 && (
            <div
              data-testid="starter-card"
              style={{
                background: 'var(--hs-bg-panel)',
                border: '1px solid var(--hs-border)',
                borderRadius: 16,
                padding: '18px 16px 16px',
                textAlign: 'center',
                margin: '8px 0 14px',
              }}
            >
              <div
                aria-hidden
                style={{
                  width: 48, height: 48, borderRadius: 14, margin: '0 auto 12px',
                  background: withAlpha(REMOTE_ACCENT, 0.16),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <ListChecks size={24} color={REMOTE_ACCENT} />
              </div>
              <h4 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: 'var(--hs-text-primary)' }}>
                {t('choresManage.starter.cardTitle')}
              </h4>
              <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--hs-text-faint)', lineHeight: 1.4 }}>
                {members.length === 0
                  ? t('choresManage.starter.cardNoMembers')
                  : t('choresManage.starter.cardDescription', { count: STARTER_CHORE_COUNT })}
              </p>
              <button
                className="press-btn"
                data-testid="starter-open"
                onClick={() => {
                  if (members.length === 0) { setSection('members'); return; }
                  setOverlay({ type: 'starter' });
                }}
                style={{
                  width: '100%',
                  minHeight: 48,
                  padding: 14,
                  borderRadius: 12,
                  fontSize: 15,
                  fontWeight: 700,
                  color: '#fff',
                  border: 'none',
                  cursor: 'pointer',
                  background: REMOTE_ACCENT,
                }}
              >
                {members.length === 0
                  ? t('choresManage.starter.cardNoMembersButton')
                  : t('choresManage.starter.cardButton')}
              </button>
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: REMOTE_ACCENT, margin: '16px 0 8px' }}>
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
                    background: chore.bonus ? withAlpha(REMOTE_ACCENT, 0.14) : 'var(--hs-bg-hover)',
                    border: chore.bonus ? `1px dashed ${withAlpha(REMOTE_ACCENT, 0.6)}` : 'none',
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
                    {buildChoreSummaryLine({ chore, t: tModules, dayNames: dayNamesShort, locale: formattingLocale })}
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
            {chores.length === 0 && members.length > 0
              ? t('choresManage.starter.writeYourOwn')
              : t('choresManage.chores.addButton')}
          </button>

          {/* The list is still reachable once chores exist, in one quiet line. */}
          {chores.length > 0 && members.length > 0 && (
            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <button
                type="button"
                className="press-scale-xs"
                data-testid="starter-link"
                onClick={() => setOverlay({ type: 'starter' })}
                style={{
                  background: 'none', border: 'none', padding: '8px 12px', minHeight: 44,
                  color: REMOTE_ACCENT, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                {t('choresManage.starter.link')}
              </button>
            </div>
          )}
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
          today={today}
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

      {overlay?.type === 'starter' && (
        <StarterChoresOverlay
          chores={chores}
          members={members}
          groups={groups}
          onAdd={addChores}
          onBack={() => setOverlay(null)}
        />
      )}
    </div>
  );
}
