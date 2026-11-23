'use client';

import { useId } from 'react';
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2, Users } from 'lucide-react';
import Button from '@/components/ui/Button';
import ChoreIcon, { MEMBER_ICONS } from '@/components/modules/chore-chart/ChoreIcon';
import IconPicker from '@/components/modules/chore-chart/IconPicker';
import { isCustomIconValue } from '@/lib/custom-icons';
import type { ChoreDefinition } from '@/types/config';
import type { Timetable } from '@/types/timetables';
import { useConfirmStore } from '@/stores/confirm-store';
import { useTranslate } from '@/i18n';
import { FAMILY_LIMITS, type FamilyGroup, type FamilyMember } from '@/types/family';
import { groupMembers } from '@/lib/family-groups';
import { memberNameLimit } from '@/lib/family-roster';
import { withAlpha } from '@/lib/hex-color';
import { memberInitials, memberInk } from '@/lib/family-avatar';
import { FAMILY_PAGE_SIZE, useFamilyRoster, type Removal } from './useFamilyRoster';

const STACK_SIZE = 4;
const INPUT = 'h-8 w-full rounded-md border border-hs-border-strong bg-hs-panel px-2.5 text-sm text-hs-text-primary';

/** Up to four member initials on their colors, then a "+N" for the rest. */
function MemberStack({ members, extra }: { members: readonly FamilyMember[]; extra: number }) {
  return (
    <span className="flex shrink-0 items-center" aria-hidden="true">
      {members.map((member, index) => (
        <span key={member.id} className={`flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold ring-2 ring-hs-panel ${index > 0 ? '-ml-2' : ''}`} style={{ backgroundColor: member.color, color: memberInk(member.color) }}>{memberInitials(member.name)}</span>
      ))}
      {extra > 0 && <span className={`flex h-7 w-7 items-center justify-center rounded-full bg-hs-card text-[11px] font-semibold text-hs-text-muted ring-2 ring-hs-panel ${members.length > 0 ? '-ml-2' : ''}`}>+{extra}</span>}
    </span>
  );
}

/**
 * The family roster on the editor's Family page and in the chore window: a
 * mouse surface, so small buttons and the editor's own question
 * (`useConfirmStore`). The phone draws the same roster with its own markup in
 * `PhoneFamilyManager`; both run on `useFamilyRoster`.
 */
export default function FamilyManager({ onChanged, onEditingChange, chores, timetables }: {
  onChanged?: () => void;
  /** True while a person or group form or a remove question is open, so a window holding this can stay open. */
  onEditingChange?: (editing: boolean) => void;
  chores?: readonly ChoreDefinition[];
  timetables?: readonly Timetable[];
} = {}) {
  const t = useTranslate('core');
  const roster = useFamilyRoster({ onChanged, onEditingChange, chores, timetables });
  const { members, groups, draft, setDraft, groupDraft, setGroupDraft, groupProblem, busy, editable, choreCounts, hasTimetable } = roster;
  const confirm = useConfirmStore((state) => state.confirm);
  const formId = useId();

  /** Ask in the editor's own window; the question counts as editing while it is open. */
  async function ask(removal: Removal | null) {
    if (!removal) return;
    roster.setRemoval(removal);
    const yes = await confirm({ title: removal.title, message: removal.body, confirmLabel: removal.confirmLabel, variant: 'danger' });
    if (yes) await removal.run();
    else roster.setRemoval(null);
  }

  const feedback = roster.notice && <p role="status" className="rounded-lg border border-hs-border bg-hs-card p-2.5 text-sm text-hs-text-body">{roster.notice}</p>;

  const memberForm = draft && (
    <form className="space-y-3 rounded-lg border border-hs-border-strong bg-hs-card p-3" onSubmit={(event) => { event.preventDefault(); roster.saveDraft(); }}>
      <h3 className="text-sm font-semibold text-hs-text-primary">{t(draft.isNew ? 'family.add' : 'family.edit')}</h3>
      <div>
        <label className="mb-1 block text-xs text-hs-text-muted" htmlFor={`${formId}-name`}>{t('actions.name')}</label>
        <input id={`${formId}-name`} disabled={busy} autoFocus required maxLength={memberNameLimit(FAMILY_LIMITS.maxNameLength, draft.member, draft.baseline.members)} value={draft.member.name} onChange={(event) => setDraft({ ...draft, member: { ...draft.member, name: event.target.value } })} className={INPUT} />
      </div>
      <fieldset disabled={busy} className="min-w-0 space-y-3">
        <IconPicker value={draft.member.emoji ?? ''} onChange={(emoji) => setDraft({ ...draft, member: { ...draft.member, emoji } })} icons={MEMBER_ICONS} label={t('actions.icon')} suggestedName={draft.member.name} />
        <div className="min-w-0">
          <label className="mb-1 block text-xs text-hs-text-muted" htmlFor={`${formId}-emoji`}>{t('family.emoji')}</label>
          <input id={`${formId}-emoji`} disabled={busy} maxLength={16} value={draft.member.emoji?.startsWith('lucide:') || isCustomIconValue(draft.member.emoji) ? '' : draft.member.emoji ?? ''} onChange={(event) => setDraft({ ...draft, member: { ...draft.member, emoji: event.target.value } })} className={INPUT} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-hs-text-muted" htmlFor={`${formId}-color`}>{t('family.color')}</label>
          <input id={`${formId}-color`} disabled={busy} type="color" value={draft.member.color} onChange={(event) => setDraft({ ...draft, member: { ...draft.member, color: event.target.value } })} className="h-8 w-12 rounded-md border border-hs-border-strong bg-hs-panel p-0.5" />
        </div>
      </fieldset>
      <div className="flex justify-end gap-2">
        <Button size="sm" disabled={busy} type="button" onClick={() => setDraft(null)}>{t('actions.cancel')}</Button>
        <Button size="sm" variant="primary" type="submit" disabled={busy || !draft.member.name.trim()}>{t(busy ? 'status.saving' : 'actions.save')}</Button>
      </div>
    </form>
  );

  const groupForm = groupDraft && (
    <form data-testid="family-group-form" className="space-y-3 rounded-lg border border-hs-border-strong bg-hs-card p-3" onSubmit={(event) => { event.preventDefault(); roster.saveGroupDraft(); }}>
      <h3 className="text-sm font-semibold text-hs-text-primary">{t(groupDraft.isNew ? 'family.groups.add' : 'family.groups.edit')}</h3>
      <div>
        <label className="mb-1 block text-xs text-hs-text-muted" htmlFor={`${formId}-group-name`}>{t('family.groups.name')}</label>
        <input id={`${formId}-group-name`} disabled={busy} autoFocus required maxLength={FAMILY_LIMITS.maxGroupNameLength} value={groupDraft.group.name} onChange={(event) => setGroupDraft({ ...groupDraft, group: { ...groupDraft.group, name: event.target.value } })} className={INPUT} aria-describedby={groupProblem === 'duplicate' ? `${formId}-group-name-problem` : undefined} />
        {groupProblem === 'duplicate' && <p id={`${formId}-group-name-problem`} role="status" className="mt-1 text-xs text-hs-warning-ink">{t('refusals.family.groupNameTaken', { name: groupDraft.group.name.trim() })}</p>}
      </div>
      <fieldset disabled={busy} className="min-w-0">
        <legend className="mb-1 text-xs text-hs-text-muted">{t('family.groups.members')}</legend>
        <div className="grid grid-cols-2 gap-x-4 sm:grid-cols-3">
          {members.map((member) => {
            const checked = groupDraft.group.memberIds.includes(member.id);
            return (
              <label key={member.id} className="flex min-h-8 items-center gap-2 text-sm text-hs-text-body">
                <input type="checkbox" className="h-4 w-4 accent-hs-accent" checked={checked} onChange={(event) => setGroupDraft({ ...groupDraft, group: { ...groupDraft.group, memberIds: event.target.checked ? [...groupDraft.group.memberIds, member.id] : groupDraft.group.memberIds.filter((id) => id !== member.id) } })} />
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: member.color }} aria-hidden="true" />
                {member.name}
              </label>
            );
          })}
        </div>
      </fieldset>
      <div className="flex justify-end gap-2">
        <Button size="sm" disabled={busy} type="button" onClick={() => setGroupDraft(null)}>{t('actions.cancel')}</Button>
        <Button size="sm" variant="primary" type="submit" disabled={busy || !!groupProblem}>{t(busy ? 'status.saving' : 'actions.save')}</Button>
      </div>
    </form>
  );

  const iconButton = 'flex h-7 w-7 items-center justify-center rounded-md text-hs-text-muted hover:bg-hs-card hover:text-hs-text-body disabled:opacity-50 disabled:cursor-not-allowed';

  return (
    <section data-testid="family-manager" className="space-y-3">
      {roster.loading && <p className="text-sm text-hs-text-muted">{t('loading')}</p>}
      {roster.error && <div role="alert" className="flex items-center gap-2 rounded-lg bg-hs-danger/10 p-2.5 text-sm text-hs-danger">{t('family.loadFailed')} <Button size="sm" onClick={roster.refresh}>{t('family.retry')}</Button></div>}
      {feedback}
      {!roster.loading && !roster.error && members.length === 0 && !draft && (
        <div className="rounded-xl border border-dashed border-hs-border-strong p-6 text-center">
          <Users className="mx-auto mb-2 h-7 w-7 text-hs-accent" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-hs-text-primary">{t('family.emptyTitle')}</h3>
          <p className="mt-1 text-sm text-hs-text-muted">{t('family.emptyDescription')}</p>
        </div>
      )}
      <div className="divide-y divide-hs-border overflow-hidden rounded-lg border border-hs-border">
        {members.slice(roster.page * FAMILY_PAGE_SIZE, (roster.page + 1) * FAMILY_PAGE_SIZE).map((member, row) => {
          const index = roster.page * FAMILY_PAGE_SIZE + row;
          return (
            <div key={member.id} className="flex flex-wrap items-center gap-2 bg-hs-panel px-3 py-2" data-testid="family-member">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base" style={{ backgroundColor: withAlpha(member.color, 0.145), color: member.color }}>{member.emoji ? <ChoreIcon value={member.emoji} color={member.color} size={20} bare fallback={memberInitials(member.name)} /> : memberInitials(member.name)}</span>
              <div className="min-w-24 flex-1 break-words"><span className="text-sm font-medium text-hs-text-primary">{member.name}</span>{(choreCounts || hasTimetable) && <p className="mt-0.5 text-xs text-hs-text-muted">{[choreCounts && t('family.choreCount', { count: choreCounts.get(member.id) ?? 0 }), hasTimetable?.has(member.id) && t('family.hasTimetable')].filter(Boolean).join(' · ')}</p>}</div>
              <div className="flex shrink-0 gap-0.5">
                <button type="button" className={iconButton} disabled={!editable || index === 0} aria-label={t('family.moveUp', { name: member.name })} onClick={() => roster.move(index, -1)}><ArrowUp size={14} /></button>
                <button type="button" className={iconButton} disabled={!editable || index === members.length - 1} aria-label={t('family.moveDown', { name: member.name })} onClick={() => roster.move(index, 1)}><ArrowDown size={14} /></button>
                <button type="button" className={iconButton} disabled={!editable} aria-label={t('family.editName', { name: member.name })} onClick={() => roster.beginEdit(member)}><Pencil size={14} /></button>
                <button type="button" className={`${iconButton} hover:text-hs-danger`} disabled={!editable} aria-label={t('family.removeTitle', { name: member.name })} onClick={() => void ask(roster.memberRemoval(member))}><Trash2 size={14} /></button>
              </div>
            </div>
          );
        })}
      </div>
      {roster.pageCount > 1 && (
        <nav className="flex items-center justify-between gap-3" aria-label={t('family.pagination')}>
          <Button size="sm" disabled={roster.page === 0} onClick={() => roster.setPage(roster.page - 1)}>{t('family.previous')}</Button>
          <span className="text-xs text-hs-text-muted">{t('family.page', { page: roster.page + 1, total: roster.pageCount })}</span>
          <Button size="sm" disabled={roster.page === roster.pageCount - 1} onClick={() => roster.setPage(roster.page + 1)}>{t('family.next')}</Button>
        </nav>
      )}
      {draft ? memberForm : (
        <Button size="sm" variant="primary" className="flex items-center gap-1.5" disabled={!editable || members.length >= FAMILY_LIMITS.maxMembers} onClick={() => roster.beginEdit()}><Plus size={14} />{t('family.add')}</Button>
      )}
      {members.length >= FAMILY_LIMITS.maxMembers && <p className="text-xs text-hs-text-muted">{t('family.limit', { count: FAMILY_LIMITS.maxMembers })}</p>}
      {(members.length > 0 || groups.length > 0) && (
        <div data-testid="family-groups" className="space-y-3 pt-4">
          <div>
            <h3 className="text-sm font-semibold text-hs-text-primary">{t('family.groups.title')}</h3>
            <p className="mt-1 text-xs leading-relaxed text-hs-text-muted">{t('family.groups.description')}</p>
          </div>
          {groups.length > 0 && (
            <div className="divide-y divide-hs-border overflow-hidden rounded-lg border border-hs-border">
              {groups.map((group: FamilyGroup) => {
                const inGroup = groupMembers(group, members);
                return (
                  <div key={group.id} className="flex flex-wrap items-center gap-3 bg-hs-panel px-3 py-2" data-testid="family-group">
                    <MemberStack members={inGroup.slice(0, STACK_SIZE)} extra={Math.max(0, inGroup.length - STACK_SIZE)} />
                    <div className="min-w-24 flex-1 break-words">
                      <span className="text-sm font-medium text-hs-text-primary">{group.name}</span>
                      <p className="mt-0.5 text-xs text-hs-text-muted">{inGroup.length > 0 ? inGroup.map((member) => member.name).join(', ') : t('family.groups.noMembers')}</p>
                    </div>
                    <div className="flex shrink-0 gap-0.5">
                      <button type="button" className={iconButton} disabled={!editable} aria-label={t('family.groups.editName', { name: group.name })} onClick={() => roster.beginGroupEdit(group)}><Pencil size={14} /></button>
                      <button type="button" className={`${iconButton} hover:text-hs-danger`} disabled={!editable} aria-label={t('family.groups.removeTitle', { name: group.name })} onClick={() => void ask(roster.groupRemoval(group))}><Trash2 size={14} /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {groupDraft ? groupForm : (
            <Button size="sm" className="flex items-center gap-1.5" disabled={!editable || members.length === 0 || groups.length >= FAMILY_LIMITS.maxGroups} onClick={() => roster.beginGroupEdit()}><Plus size={14} />{t('family.groups.add')}</Button>
          )}
          {groups.length >= FAMILY_LIMITS.maxGroups && <p className="text-xs text-hs-text-muted">{t('family.groups.limit', { count: FAMILY_LIMITS.maxGroups })}</p>}
          <p className="text-xs text-hs-text-muted">{t('family.groups.hint')}</p>
        </div>
      )}
    </section>
  );
}
