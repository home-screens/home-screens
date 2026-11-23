'use client';

import { useId, type CSSProperties } from 'react';
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2, Users } from 'lucide-react';
import ChoreIcon, { MEMBER_ICONS } from '@/components/modules/chore-chart/ChoreIcon';
import PhoneIconPicker from '@/components/custom-icons/PhoneIconPicker';
import { isCustomIconValue } from '@/lib/custom-icons';
import MobileColorPicker from '@/app/(remote)/remote/components/MobileColorPicker';
import FormOverlay from '@/app/(remote)/remote/components/FormOverlay';
import SaveDeleteFooter from '@/app/(remote)/remote/components/SaveDeleteFooter';
import ConfirmSheet from '@/app/(remote)/remote/components/ConfirmSheet';
import PrimaryButton from '@/app/(remote)/remote/components/PrimaryButton';
import { FIELD, FIELD_LABEL, GHOST_BUTTON, HELPER_TEXT, REMOTE_ACCENT, REMOTE_ACCENT_INK } from '@/app/(remote)/remote/components/remote-styles';
import type { ChoreDefinition } from '@/types/config';
import type { Timetable } from '@/types/timetables';
import { useTranslate } from '@/i18n';
import { FAMILY_LIMITS, type FamilyMember } from '@/types/family';
import { groupMembers } from '@/lib/family-groups';
import { memberNameLimit } from '@/lib/family-roster';
import { withAlpha } from '@/lib/hex-color';
import { memberInitials, memberInk } from '@/lib/family-avatar';
import { FAMILY_PAGE_SIZE, useFamilyRoster } from './useFamilyRoster';

const STACK_SIZE = 4;

const LIST: CSSProperties = { borderRadius: 14, overflow: 'hidden', border: '1px solid var(--hs-border)' };
const ROW: CSSProperties = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: '10px 8px 10px 12px', background: 'var(--hs-bg-panel)' };
const ROW_NAME: CSSProperties = { fontSize: 15, fontWeight: 600, color: 'var(--hs-text-primary)' };
const ROW_META: CSSProperties = { fontSize: 12, color: 'var(--hs-text-muted)', marginTop: 2 };
const NOTICE: CSSProperties = { margin: '0 0 16px', padding: 12, borderRadius: 12, border: '1px solid var(--hs-border)', background: 'var(--hs-bg-card)', fontSize: 14, color: 'var(--hs-text-body)' };
const SECTION_TITLE: CSSProperties = { fontSize: 15, fontWeight: 700, color: 'var(--hs-text-primary)', margin: 0 };

/** A 44 px icon button on a roster row. */
function rowButton(danger = false, disabled = false): CSSProperties {
  return {
    width: 44, height: 44, flexShrink: 0, borderRadius: 10, border: 'none', background: 'none',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: danger ? 'var(--hs-danger)' : 'var(--hs-text-muted)',
    cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.35 : 1,
  };
}

/** Up to four member initials on their colors, then a "+N" for the rest. */
function MemberStack({ members, extra }: { members: readonly FamilyMember[]; extra: number }) {
  const dot: CSSProperties = { width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, boxShadow: '0 0 0 2px var(--hs-bg-panel)' };
  return (
    <span aria-hidden="true" style={{ display: 'flex', flexShrink: 0, alignItems: 'center' }}>
      {members.map((member, index) => (
        <span key={member.id} style={{ ...dot, marginLeft: index > 0 ? -8 : 0, background: member.color, color: memberInk(member.color) }}>{memberInitials(member.name)}</span>
      ))}
      {extra > 0 && <span style={{ ...dot, marginLeft: members.length > 0 ? -8 : 0, background: 'var(--hs-bg-card)', color: 'var(--hs-text-muted)' }}>+{extra}</span>}
    </span>
  );
}

/**
 * The family roster on the phone: Settings > Family, Chores > Manage >
 * Members, and the chore form before anyone is on the list. Touch-sized and
 * drawn like every other phone form: full-screen forms with the shared
 * fields and footer, and the phone's own question (red answer on top) before
 * a person or group is removed. The editor draws the same roster in
 * `FamilyManager`; both run on `useFamilyRoster`.
 */
export default function PhoneFamilyManager({ onChanged, chores, timetables }: {
  onChanged?: () => void;
  chores?: readonly ChoreDefinition[];
  timetables?: readonly Timetable[];
} = {}) {
  const t = useTranslate('core');
  const roster = useFamilyRoster({ onChanged, chores, timetables });
  const { members, groups, draft, setDraft, groupDraft, setGroupDraft, groupProblem, busy, editable, choreCounts, hasTimetable, removal } = roster;
  const formId = useId();

  const feedback = roster.notice && <p role="status" style={NOTICE}>{roster.notice}</p>;

  const memberForm = draft && (
    <FormOverlay
      backDisabled={busy}
      title={t(draft.isNew ? 'family.add' : 'family.edit')}
      dirty={JSON.stringify(draft.member) !== JSON.stringify(draft.initial)}
      onBack={() => { if (!busy) setDraft(null); }}
      footer={<SaveDeleteFooter canSave={!!draft.member.name.trim()} busy={busy} onSave={roster.saveDraft} />}
    >
      <form onSubmit={(event) => { event.preventDefault(); roster.saveDraft(); }}>
        {feedback}
        <div style={{ marginBottom: 24 }}>
          <label style={FIELD_LABEL} htmlFor={`${formId}-name`}>{t('actions.name')}</label>
          <input id={`${formId}-name`} disabled={busy} autoFocus required maxLength={memberNameLimit(FAMILY_LIMITS.maxNameLength, draft.member, draft.baseline.members)} value={draft.member.name} onChange={(event) => setDraft({ ...draft, member: { ...draft.member, name: event.target.value } })} style={FIELD} />
        </div>
        <fieldset disabled={busy} style={{ minWidth: 0, margin: 0, padding: 0, border: 'none' }}>
          <PhoneIconPicker value={draft.member.emoji ?? ''} onChange={(emoji) => setDraft({ ...draft, member: { ...draft.member, emoji } })} choices={{ kind: 'icons', names: MEMBER_ICONS }} label={t('actions.icon')} suggestedName={draft.member.name} />
          <div style={{ marginBottom: 24 }}>
            <label style={FIELD_LABEL} htmlFor={`${formId}-emoji`}>{t('family.emoji')}</label>
            <input id={`${formId}-emoji`} disabled={busy} maxLength={16} value={draft.member.emoji?.startsWith('lucide:') || isCustomIconValue(draft.member.emoji) ? '' : draft.member.emoji ?? ''} onChange={(event) => setDraft({ ...draft, member: { ...draft.member, emoji: event.target.value } })} style={FIELD} />
          </div>
          <MobileColorPicker value={draft.member.color} onChange={(color) => setDraft({ ...draft, member: { ...draft.member, color } })} />
        </fieldset>
      </form>
    </FormOverlay>
  );

  const groupForm = groupDraft && (
    <FormOverlay
      backDisabled={busy}
      title={t(groupDraft.isNew ? 'family.groups.add' : 'family.groups.edit')}
      dirty={JSON.stringify(groupDraft.group) !== JSON.stringify(groupDraft.initial)}
      onBack={() => { if (!busy) setGroupDraft(null); }}
      footer={<SaveDeleteFooter canSave={!groupProblem} busy={busy} onSave={roster.saveGroupDraft} />}
    >
      <form data-testid="family-group-form" onSubmit={(event) => { event.preventDefault(); roster.saveGroupDraft(); }}>
        {feedback}
        <div style={{ marginBottom: 24 }}>
          <label style={FIELD_LABEL} htmlFor={`${formId}-group-name`}>{t('family.groups.name')}</label>
          <input id={`${formId}-group-name`} disabled={busy} autoFocus required maxLength={FAMILY_LIMITS.maxGroupNameLength} value={groupDraft.group.name} onChange={(event) => setGroupDraft({ ...groupDraft, group: { ...groupDraft.group, name: event.target.value } })} style={FIELD} aria-describedby={groupProblem === 'duplicate' ? `${formId}-group-name-problem` : undefined} />
          {groupProblem === 'duplicate' && <p id={`${formId}-group-name-problem`} role="status" style={{ ...HELPER_TEXT, fontSize: 13, color: 'var(--hs-warning-ink)' }}>{t('refusals.family.groupNameTaken', { name: groupDraft.group.name.trim() })}</p>}
        </div>
        <fieldset disabled={busy} style={{ minWidth: 0, margin: 0, padding: 0, border: 'none' }}>
          <legend style={FIELD_LABEL}>{t('family.groups.members')}</legend>
          {members.map((member) => {
            const checked = groupDraft.group.memberIds.includes(member.id);
            return (
              <label key={member.id} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 48, fontSize: 15, color: 'var(--hs-text-body)', cursor: 'pointer' }}>
                <input type="checkbox" style={{ width: 20, height: 20, accentColor: REMOTE_ACCENT }} checked={checked} onChange={(event) => setGroupDraft({ ...groupDraft, group: { ...groupDraft.group, memberIds: event.target.checked ? [...groupDraft.group.memberIds, member.id] : groupDraft.group.memberIds.filter((id) => id !== member.id) } })} />
                <span aria-hidden="true" style={{ width: 10, height: 10, flexShrink: 0, borderRadius: '50%', background: member.color }} />
                {member.name}
              </label>
            );
          })}
        </fieldset>
      </form>
    </FormOverlay>
  );

  return (
    <section data-testid="family-manager" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {roster.loading && <p style={{ margin: 0, fontSize: 14, color: 'var(--hs-text-muted)' }}>{t('loading')}</p>}
      {roster.error && (
        <div role="alert" style={{ padding: 12, borderRadius: 12, background: withAlpha('var(--hs-danger)', 0.1), color: 'var(--hs-danger)', fontSize: 14 }}>
          {t('family.loadFailed')}
          <button type="button" className="press-scale" onClick={roster.refresh} style={{ ...GHOST_BUTTON, marginTop: 10 }}>{t('family.retry')}</button>
        </div>
      )}
      {!draft && feedback}
      {!roster.loading && !roster.error && members.length === 0 && !draft && (
        <div style={{ padding: 28, textAlign: 'center', borderRadius: 16, border: '1px dashed var(--hs-border-strong)' }}>
          <Users size={32} aria-hidden="true" style={{ color: REMOTE_ACCENT_INK, margin: '0 auto 10px', display: 'block' }} />
          <h3 style={{ ...SECTION_TITLE, fontSize: 16 }}>{t('family.emptyTitle')}</h3>
          <p style={{ margin: '6px 0 0', fontSize: 14, color: 'var(--hs-text-muted)' }}>{t('family.emptyDescription')}</p>
        </div>
      )}
      {members.length > 0 && (
        <div style={LIST}>
          {members.slice(roster.page * FAMILY_PAGE_SIZE, (roster.page + 1) * FAMILY_PAGE_SIZE).map((member, row) => {
            const index = roster.page * FAMILY_PAGE_SIZE + row;
            const meta = [choreCounts && t('family.choreCount', { count: choreCounts.get(member.id) ?? 0 }), hasTimetable?.has(member.id) && t('family.hasTimetable')].filter(Boolean).join(' · ');
            return (
              <div key={member.id} data-testid="family-member" style={{ ...ROW, borderTop: row === 0 ? 'none' : '1px solid var(--hs-border)' }}>
                <span style={{ width: 40, height: 40, flexShrink: 0, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, background: withAlpha(member.color, 0.145), color: member.color }}>
                  {member.emoji ? <ChoreIcon value={member.emoji} color={member.color} size={24} bare fallback={memberInitials(member.name)} /> : memberInitials(member.name)}
                </span>
                <div style={{ flex: 1, minWidth: 96, overflowWrap: 'anywhere' }}>
                  <span style={ROW_NAME}>{member.name}</span>
                  {meta && <p style={{ ...ROW_META, margin: '2px 0 0' }}>{meta}</p>}
                </div>
                <div style={{ display: 'flex', flexShrink: 0 }}>
                  <button type="button" style={rowButton(false, !editable || index === 0)} disabled={!editable || index === 0} aria-label={t('family.moveUp', { name: member.name })} onClick={() => roster.move(index, -1)}><ArrowUp size={18} /></button>
                  <button type="button" style={rowButton(false, !editable || index === members.length - 1)} disabled={!editable || index === members.length - 1} aria-label={t('family.moveDown', { name: member.name })} onClick={() => roster.move(index, 1)}><ArrowDown size={18} /></button>
                  <button type="button" style={rowButton(false, !editable)} disabled={!editable} aria-label={t('family.editName', { name: member.name })} onClick={() => roster.beginEdit(member)}><Pencil size={18} /></button>
                  <button type="button" style={rowButton(true, !editable)} disabled={!editable} aria-label={t('family.removeTitle', { name: member.name })} onClick={() => roster.setRemoval(roster.memberRemoval(member))}><Trash2 size={18} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {roster.pageCount > 1 && (
        <nav aria-label={t('family.pagination')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <button type="button" className="press-scale" style={{ ...GHOST_BUTTON, marginTop: 0, width: 'auto', padding: '0 16px' }} disabled={roster.page === 0} onClick={() => roster.setPage(roster.page - 1)}>{t('family.previous')}</button>
          <span style={{ fontSize: 13, color: 'var(--hs-text-muted)' }}>{t('family.page', { page: roster.page + 1, total: roster.pageCount })}</span>
          <button type="button" className="press-scale" style={{ ...GHOST_BUTTON, marginTop: 0, width: 'auto', padding: '0 16px' }} disabled={roster.page === roster.pageCount - 1} onClick={() => roster.setPage(roster.page + 1)}>{t('family.next')}</button>
        </nav>
      )}
      <PrimaryButton disabled={!editable || members.length >= FAMILY_LIMITS.maxMembers} onClick={() => roster.beginEdit()} style={{ marginTop: 0, gap: 8 }}>
        <Plus size={18} aria-hidden="true" />{t('family.add')}
      </PrimaryButton>
      {members.length >= FAMILY_LIMITS.maxMembers && <p style={{ ...HELPER_TEXT, marginTop: -8 }}>{t('family.limit', { count: FAMILY_LIMITS.maxMembers })}</p>}
      {(members.length > 0 || groups.length > 0) && (
        <div data-testid="family-groups" style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 12 }}>
          <div>
            <h3 style={SECTION_TITLE}>{t('family.groups.title')}</h3>
            <p style={{ ...HELPER_TEXT, marginTop: 4 }}>{t('family.groups.description')}</p>
          </div>
          {groups.length > 0 && (
            <div style={LIST}>
              {groups.map((group, row) => {
                const inGroup = groupMembers(group, members);
                return (
                  <div key={group.id} data-testid="family-group" style={{ ...ROW, gap: 12, borderTop: row === 0 ? 'none' : '1px solid var(--hs-border)' }}>
                    <MemberStack members={inGroup.slice(0, STACK_SIZE)} extra={Math.max(0, inGroup.length - STACK_SIZE)} />
                    <div style={{ flex: 1, minWidth: 96, overflowWrap: 'anywhere' }}>
                      <span style={ROW_NAME}>{group.name}</span>
                      <p style={{ ...ROW_META, margin: '2px 0 0' }}>{inGroup.length > 0 ? inGroup.map((member) => member.name).join(', ') : t('family.groups.noMembers')}</p>
                    </div>
                    <div style={{ display: 'flex', flexShrink: 0 }}>
                      <button type="button" style={rowButton(false, !editable)} disabled={!editable} aria-label={t('family.groups.editName', { name: group.name })} onClick={() => roster.beginGroupEdit(group)}><Pencil size={18} /></button>
                      <button type="button" style={rowButton(true, !editable)} disabled={!editable} aria-label={t('family.groups.removeTitle', { name: group.name })} onClick={() => roster.setRemoval(roster.groupRemoval(group))}><Trash2 size={18} /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <button
            type="button"
            className="press-scale"
            disabled={!editable || members.length === 0 || groups.length >= FAMILY_LIMITS.maxGroups}
            onClick={() => roster.beginGroupEdit()}
            style={{ ...GHOST_BUTTON, marginTop: 0, gap: 8, opacity: !editable || members.length === 0 || groups.length >= FAMILY_LIMITS.maxGroups ? 0.5 : 1 }}
          >
            <Plus size={18} aria-hidden="true" />{t('family.groups.add')}
          </button>
          {groups.length >= FAMILY_LIMITS.maxGroups && <p style={{ ...HELPER_TEXT, marginTop: 0 }}>{t('family.groups.limit', { count: FAMILY_LIMITS.maxGroups })}</p>}
          <p style={{ ...HELPER_TEXT, marginTop: 0 }}>{t('family.groups.hint')}</p>
        </div>
      )}
      {memberForm}
      {groupForm}
      {removal && (
        <ConfirmSheet
          title={removal.title}
          description={removal.body}
          confirmLabel={removal.confirmLabel}
          onConfirm={() => {
            // Closed at once: the roster stays locked while the remove is on its way.
            roster.setRemoval(null);
            void removal.run();
          }}
          onCancel={() => roster.setRemoval(null)}
        />
      )}
    </section>
  );
}
