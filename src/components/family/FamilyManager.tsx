'use client';

import { useId, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2, Users } from 'lucide-react';
import Button from '@/components/ui/Button';
import ChoreIcon, { MEMBER_ICONS } from '@/components/modules/chore-chart/ChoreIcon';
import IconPicker from '@/components/modules/chore-chart/IconPicker';
import { isCustomIconValue } from '@/lib/custom-icons';
import MobileColorPicker from '@/app/(remote)/remote/components/MobileColorPicker';
import FormOverlay from '@/app/(remote)/remote/components/FormOverlay';
import { useFetchData } from '@/hooks/useFetchData';
import { choresDataUrl, timetablesUrl } from '@/lib/fetch-keys';
import type { ChoreDefinition } from '@/types/config';
import type { Timetable, TimetableData } from '@/types/timetables';
import { useFamilyData, publishFamilyData, type FamilySnapshot } from '@/hooks/useFamilyData';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { editorFetch } from '@/lib/editor-fetch';
import { uuid } from '@/lib/uuid';
import { useTranslate } from '@/i18n';
import { FAMILY_LIMITS, MEMBER_COLORS, type FamilyGroup, type FamilyMember } from '@/types/family';
import { groupDraftProblem, groupMembers } from '@/lib/family-groups';
import { choreAssigneeIds } from '@/lib/chore-assignments';
import { initialsOf } from '@/lib/calendar-people';

const PAGE_SIZE = 12;
interface Draft { member: FamilyMember; initial: FamilyMember; baseline: FamilySnapshot; isNew: boolean }
interface GroupDraft { group: FamilyGroup; initial: FamilyGroup; baseline: FamilySnapshot; isNew: boolean }
const STACK_SIZE = 4;
type Variant = 'desktop' | 'mobile';

function ConfirmRemove({ title, body, confirmLabel, variant, busy, onCancel, onConfirm }: {
  title: string; body: string; confirmLabel: string; variant: Variant; busy: boolean; onCancel: () => void; onConfirm: () => void;
}) {
  const t = useTranslate('core');
  const ref = useFocusTrap<HTMLDivElement>();
  const id = useId();
  return (
    <div className={`fixed inset-0 z-[160] flex justify-center bg-black/60 ${variant === 'mobile' ? 'items-end' : 'items-center p-5'}`} role="alertdialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-body`}>
      <div ref={ref} className={`w-full border border-hs-border bg-hs-panel p-5 shadow-xl ${variant === 'mobile' ? 'max-w-[640px] rounded-t-2xl pb-[max(20px,env(safe-area-inset-bottom))]' : 'max-w-sm rounded-2xl'}`} onKeyDown={(event) => { if (event.key === 'Escape' && !busy) onCancel(); }}>
        <h3 id={`${id}-title`} className="font-semibold text-hs-text-primary">{title}</h3>
        <p id={`${id}-body`} className="mt-3 text-sm leading-relaxed text-hs-text-muted">{body}</p>
        <div className={`mt-5 flex gap-2 ${variant === 'mobile' ? 'flex-col' : 'justify-end'}`}>
          <Button className="min-h-12" disabled={busy} onClick={onCancel}>{t('actions.cancel')}</Button>
          <Button className="min-h-12" variant="danger" disabled={busy} onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}

/** Up to four member initials on their colors, then a "+N" for the rest. */
function MemberStack({ members, extra }: { members: readonly FamilyMember[]; extra: number }) {
  return (
    <span className="flex shrink-0 items-center" aria-hidden="true">
      {members.map((member, index) => (
        <span key={member.id} className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white ring-2 ring-hs-panel ${index > 0 ? '-ml-2' : ''}`} style={{ backgroundColor: member.color }}>{initialsOf(member.name)}</span>
      ))}
      {extra > 0 && <span className={`flex h-8 w-8 items-center justify-center rounded-full bg-hs-card text-xs font-semibold text-hs-text-muted ring-2 ring-hs-panel ${members.length > 0 ? '-ml-2' : ''}`}>+{extra}</span>}
    </span>
  );
}

/** One revision-checked roster editor, used by the editor and the phone. */
export default function FamilyManager({ onChanged, variant = 'desktop', chores, timetables }: { onChanged?: () => void; variant?: Variant; chores?: readonly ChoreDefinition[]; timetables?: readonly Timetable[] } = {}) {
  const t = useTranslate('core');
  const { members, groups, revision, loading, error, refresh } = useFamilyData();
  const [choreData] = useFetchData<{ chores: ChoreDefinition[] }>(chores ? '' : choresDataUrl(), 60_000);
  const definitions = chores ?? choreData?.chores;
  const choreCounts = useMemo(() => definitions && new Map(members.map((member) => [member.id, definitions.filter((chore) => choreAssigneeIds(chore, groups).includes(member.id) || Object.hasOwn(chore.schedule ?? {}, member.id)).length])), [members, groups, definitions]);
  const [timetableData] = useFetchData<{ data: TimetableData }>(timetables ? '' : timetablesUrl(), 60_000);
  const savedTimetables = timetables ?? timetableData?.data?.timetables;
  const hasTimetable = useMemo(() => savedTimetables && new Set(savedTimetables.map((timetable) => timetable.memberId)), [savedTimetables]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [deleting, setDeleting] = useState<{ member: FamilyMember; baseline: FamilySnapshot; choreCount?: number; hasTimetable?: boolean } | null>(null);
  const [groupDraft, setGroupDraft] = useState<GroupDraft | null>(null);
  const [deletingGroup, setDeletingGroup] = useState<{ group: FamilyGroup; baseline: FamilySnapshot; choreCount: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const formId = useId();
  const pageCount = Math.max(1, Math.ceil(members.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const editable = revision !== null && !busy && !draft && !deleting && !groupDraft && !deletingGroup;
  const snapshot = (): FamilySnapshot | null => revision ? { members, groups, revision } : null;

  function closeForms() {
    setDraft(null);
    setDeleting(null);
    setGroupDraft(null);
    setDeletingGroup(null);
  }

  /** One checked write for both lists: a 409 adopts the hub's roster and asks for the edit again. */
  async function submit(url: string, body: Record<string, unknown>, savedKey: string, failedKey: string) {
    setBusy(true);
    setNotice(null);
    try {
      const response = await editorFetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const result = await response.json();
      if (response.status === 409) {
        if (Array.isArray(result.members) && typeof result.revision === 'string') publishFamilyData({ ...result, groups: Array.isArray(result.groups) ? result.groups : [] });
        else refresh();
        // The baseline is no longer valid. A fresh, deliberate edit is required.
        closeForms();
        setNotice(t('family.conflict'));
        return;
      }
      if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : t(failedKey));
      publishFamilyData(result as FamilySnapshot);
      closeForms();
      setNotice(t(savedKey));
      onChanged?.();
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : t(failedKey));
      setDeleting(null);
      setDeletingGroup(null);
    } finally {
      setBusy(false);
    }
  }

  function save(baseline: FamilySnapshot, next: FamilyMember[], removedIds: string[] = []) {
    return submit('/api/family', { members: next, revision: baseline.revision, removedIds }, 'family.saved', 'family.saveFailed');
  }

  function saveGroups(baseline: FamilySnapshot, next: FamilyGroup[]) {
    const body = next.map(({ id, name, memberIds }) => ({ id, name, memberIds }));
    return submit('/api/family/groups', { groups: body, revision: baseline.revision }, 'family.groups.saved', 'family.groups.saveFailed');
  }

  function beginGroupEdit(group?: FamilyGroup) {
    const baseline = snapshot();
    if (!baseline) return;
    setNotice(null);
    const now = new Date().toISOString();
    const initial = group ? { ...group, memberIds: [...group.memberIds] } : { id: uuid(), name: '', memberIds: [], createdAt: now, updatedAt: now };
    setGroupDraft({ baseline, isNew: !group, group: initial, initial });
  }

  function beginEdit(member?: FamilyMember) {
    if (!revision) return;
    setNotice(null);
    const now = new Date().toISOString();
    const initial = member ? { ...member } : { id: uuid(), name: '', color: MEMBER_COLORS[members.length % MEMBER_COLORS.length], emoji: '', createdAt: now, updatedAt: now };
    setDraft({ baseline: { members, groups, revision }, isNew: !member, member: initial, initial });
  }

  function reorder(index: number, direction: -1 | 1) {
    if (!revision) return;
    const next = [...members];
    [next[index], next[index + direction]] = [next[index + direction], next[index]];
    void save({ members, groups, revision }, next);
  }

  const feedback = notice && <p role="status" className="rounded-xl border border-hs-border bg-hs-card p-3 text-sm text-hs-text-body">{notice}</p>;
  const memberForm = draft ? <form className={variant === 'mobile' ? 'space-y-5 [&_input]:text-base' : 'space-y-4 rounded-xl border border-hs-border-strong bg-hs-card p-4'} onSubmit={(event) => {
        event.preventDefault();
        if (busy || !draft.member.name.trim()) return;
        const original = draft.baseline.members.find((member) => member.id === draft.member.id);
        const name = original?.name === draft.member.name ? draft.member.name : draft.member.name.trim();
        const member = { ...draft.member, name, emoji: draft.member.emoji?.trim() || undefined };
        void save(draft.baseline, draft.isNew ? [...draft.baseline.members, member] : draft.baseline.members.map((existing) => existing.id === member.id ? member : existing));
      }}>
        {variant === 'mobile' && feedback}
        {variant === 'desktop' && <h3 className="text-sm font-semibold text-hs-text-primary">{t(draft.isNew ? 'family.add' : 'family.edit')}</h3>}
        <div>
          <label className="mb-1 block text-sm text-hs-text-muted" htmlFor={`${formId}-name`}>{t('actions.name')}</label>
          <input id={`${formId}-name`} disabled={busy} autoFocus required maxLength={Math.max(FAMILY_LIMITS.maxNameLength, draft.baseline.members.find((member) => member.id === draft.member.id)?.name.length ?? 0)} value={draft.member.name} onChange={(event) => setDraft({ ...draft, member: { ...draft.member, name: event.target.value } })} className="min-h-12 w-full rounded-lg border border-hs-border-strong bg-hs-panel px-3 text-hs-text-primary" />
        </div>
        <fieldset disabled={busy} className="min-w-0 space-y-4">
          <IconPicker value={draft.member.emoji ?? ''} onChange={(emoji) => setDraft({ ...draft, member: { ...draft.member, emoji } })} icons={MEMBER_ICONS} label={t('actions.icon')} variant={variant} suggestedName={draft.member.name} />
          <div className="min-w-0">
            <label className="mb-1 block text-sm text-hs-text-muted" htmlFor={`${formId}-emoji`}>{t('family.emoji')}</label>
            <input id={`${formId}-emoji`} disabled={busy} maxLength={16} value={draft.member.emoji?.startsWith('lucide:') || isCustomIconValue(draft.member.emoji) ? '' : draft.member.emoji ?? ''} onChange={(event) => setDraft({ ...draft, member: { ...draft.member, emoji: event.target.value } })} className="min-h-12 w-full rounded-lg border border-hs-border-strong bg-hs-panel px-3 text-hs-text-primary" />
          </div>
          {variant === 'mobile' ? <MobileColorPicker value={draft.member.color} onChange={(color) => setDraft({ ...draft, member: { ...draft.member, color } })} /> : <div>
            <label className="mb-1 block text-sm text-hs-text-muted" htmlFor={`${formId}-color`}>{t('family.color')}</label>
            <input id={`${formId}-color`} disabled={busy} type="color" value={draft.member.color} onChange={(event) => setDraft({ ...draft, member: { ...draft.member, color: event.target.value } })} className="h-12 w-16 rounded-lg border border-hs-border-strong bg-hs-panel p-1" />
          </div>}
        </fieldset>
        <div className="flex justify-end gap-2">
          {variant === 'desktop' && <Button className="min-h-12" disabled={busy} type="button" onClick={() => setDraft(null)}>{t('actions.cancel')}</Button>}
          <Button className="min-h-12" variant="primary" type="submit" disabled={busy || !draft.member.name.trim()}>{t(busy ? 'family.saving' : 'actions.save')}</Button>
        </div>
      </form> : null;

  const groupProblem = groupDraft ? groupDraftProblem(groupDraft.group, members, groupDraft.baseline.groups.filter((group) => group.id !== groupDraft.group.id).map((group) => group.name)) : null;
  const groupForm = groupDraft ? <form data-testid="family-group-form" className={variant === 'mobile' ? 'space-y-5 [&_input]:text-base' : 'space-y-4 rounded-xl border border-hs-border-strong bg-hs-card p-4'} onSubmit={(event) => {
        event.preventDefault();
        if (busy || groupProblem) return;
        const group = { ...groupDraft.group, name: groupDraft.group.name.trim() };
        void saveGroups(groupDraft.baseline, groupDraft.isNew ? [...groupDraft.baseline.groups, group] : groupDraft.baseline.groups.map((existing) => existing.id === group.id ? group : existing));
      }}>
        {variant === 'mobile' && feedback}
        {variant === 'desktop' && <h3 className="text-sm font-semibold text-hs-text-primary">{t(groupDraft.isNew ? 'family.groups.add' : 'family.groups.edit')}</h3>}
        <div>
          <label className="mb-1 block text-sm text-hs-text-muted" htmlFor={`${formId}-group-name`}>{t('family.groups.name')}</label>
          <input id={`${formId}-group-name`} disabled={busy} autoFocus required maxLength={FAMILY_LIMITS.maxGroupNameLength} value={groupDraft.group.name} onChange={(event) => setGroupDraft({ ...groupDraft, group: { ...groupDraft.group, name: event.target.value } })} className="min-h-12 w-full rounded-lg border border-hs-border-strong bg-hs-panel px-3 text-hs-text-primary" aria-describedby={groupProblem === 'duplicate' ? `${formId}-group-name-problem` : undefined} />
          {groupProblem === 'duplicate' && <p id={`${formId}-group-name-problem`} role="status" className="mt-1 text-sm text-hs-warning">{t('family.groups.duplicateName', { name: groupDraft.group.name.trim() })}</p>}
        </div>
        <fieldset disabled={busy} className="min-w-0">
          <legend className="mb-1 text-sm text-hs-text-muted">{t('family.groups.members')}</legend>
          <div className={variant === 'mobile' ? 'grid grid-cols-1' : 'grid grid-cols-2 gap-x-4 sm:grid-cols-3'}>
            {members.map((member) => {
              const checked = groupDraft.group.memberIds.includes(member.id);
              return <label key={member.id} className="flex min-h-12 items-center gap-3 text-sm text-hs-text-body">
                <input type="checkbox" className="h-4 w-4 accent-hs-accent" checked={checked} onChange={(event) => setGroupDraft({ ...groupDraft, group: { ...groupDraft.group, memberIds: event.target.checked ? [...groupDraft.group.memberIds, member.id] : groupDraft.group.memberIds.filter((id) => id !== member.id) } })} />
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: member.color }} aria-hidden="true" />
                {member.name}
              </label>;
            })}
          </div>
        </fieldset>
        <div className="flex justify-end gap-2">
          {variant === 'desktop' && <Button className="min-h-12" disabled={busy} type="button" onClick={() => setGroupDraft(null)}>{t('actions.cancel')}</Button>}
          <Button className="min-h-12" variant="primary" type="submit" disabled={busy || !!groupProblem}>{t(busy ? 'family.saving' : 'actions.save')}</Button>
        </div>
      </form> : null;

  return (
    <section data-testid="family-manager" className="space-y-4">
      {loading && <p className="text-sm text-hs-text-muted">{t('loading')}</p>}
      {error && <div role="alert" className="rounded-xl bg-hs-danger/10 p-3 text-sm text-hs-danger">{t('family.loadFailed')} <Button onClick={refresh}>{t('family.retry')}</Button></div>}
      {!(draft && variant === 'mobile') && feedback}
      {!loading && !error && members.length === 0 && !draft && (
        <div className="rounded-2xl border border-dashed border-hs-border-strong p-8 text-center">
          <Users className="mx-auto mb-3 h-8 w-8 text-hs-accent" aria-hidden="true" />
          <h3 className="font-semibold text-hs-text-primary">{t('family.emptyTitle')}</h3>
          <p className="mt-2 text-sm text-hs-text-muted">{t('family.emptyDescription')}</p>
        </div>
      )}
      <div className="divide-y divide-hs-border overflow-hidden rounded-xl border border-hs-border">
        {members.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map((member, row) => {
          const index = currentPage * PAGE_SIZE + row;
          return (
            <div key={member.id} className="flex flex-wrap items-center gap-2 bg-hs-panel p-3" data-testid="family-member">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg" style={{ backgroundColor: `${member.color}25`, color: member.color }}>{member.emoji ? <ChoreIcon value={member.emoji} color={member.color} size={24} bare fallback={member.name.slice(0, 1)} /> : member.name.slice(0, 1)}</span>
              <div className="min-w-24 flex-1 break-words"><span className="text-sm font-medium text-hs-text-primary">{member.name}</span>{(choreCounts || hasTimetable) && <p className="mt-1 text-xs text-hs-text-muted">{[choreCounts && t('family.choreCount', { count: choreCounts.get(member.id) ?? 0 }), hasTimetable?.has(member.id) && t('family.hasTimetable')].filter(Boolean).join(' · ')}</p>}</div>
              <div className="flex shrink-0">
                <Button variant="ghost" className="min-h-12 min-w-12 px-1" disabled={!editable || index === 0} aria-label={t('family.moveUp', { name: member.name })} onClick={() => reorder(index, -1)}><ArrowUp size={16} /></Button>
                <Button variant="ghost" className="min-h-12 min-w-12 px-1" disabled={!editable || index === members.length - 1} aria-label={t('family.moveDown', { name: member.name })} onClick={() => reorder(index, 1)}><ArrowDown size={16} /></Button>
                <Button variant="ghost" className="min-h-12 min-w-12 px-1" disabled={!editable} aria-label={t('family.editName', { name: member.name })} onClick={() => beginEdit(member)}><Pencil size={16} /></Button>
                <Button variant="ghost" className="min-h-12 min-w-12 px-1 text-hs-danger" disabled={!editable} aria-label={t('family.removeTitle', { name: member.name })} onClick={() => setDeleting({ member, baseline: { members, groups, revision: revision! }, choreCount: choreCounts?.get(member.id), hasTimetable: hasTimetable?.has(member.id) })}><Trash2 size={16} /></Button>
              </div>
            </div>
          );
        })}
      </div>
      {pageCount > 1 && <nav className="flex items-center justify-between gap-3" aria-label={t('family.pagination')}>
        <Button className="min-h-12" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>{t('family.previous')}</Button>
        <span className="text-xs text-hs-text-muted">{t('family.page', { page: currentPage + 1, total: pageCount })}</span>
        <Button className="min-h-12" disabled={currentPage === pageCount - 1} onClick={() => setPage(currentPage + 1)}>{t('family.next')}</Button>
      </nav>}
      {draft ? (variant === 'mobile' ? <FormOverlay backDisabled={busy} title={t(draft.isNew ? 'family.add' : 'family.edit')} dirty={JSON.stringify(draft.member) !== JSON.stringify(draft.initial)} onBack={() => { if (!busy) setDraft(null); }}>{memberForm}</FormOverlay> : memberForm) : <Button variant="primary" className="flex min-h-12 items-center gap-2" disabled={!editable || members.length >= FAMILY_LIMITS.maxMembers} onClick={() => beginEdit()}><Plus size={16} />{t('family.add')}</Button>}
      {members.length >= FAMILY_LIMITS.maxMembers && <p className="text-xs text-hs-text-muted">{t('family.limit', { count: FAMILY_LIMITS.maxMembers })}</p>}
      {(members.length > 0 || groups.length > 0) && !(draft && variant === 'mobile') && (
        <div data-testid="family-groups" className="space-y-3 pt-4">
          <div>
            <h3 className="text-sm font-semibold text-hs-text-primary">{t('family.groups.title')}</h3>
            <p className="mt-1 text-xs leading-relaxed text-hs-text-muted">{t('family.groups.description')}</p>
          </div>
          {groups.length > 0 && <div className="divide-y divide-hs-border overflow-hidden rounded-xl border border-hs-border">
            {groups.map((group) => {
              const inGroup = groupMembers(group, members);
              return (
                <div key={group.id} className="flex flex-wrap items-center gap-3 bg-hs-panel p-3" data-testid="family-group">
                  <MemberStack members={inGroup.slice(0, STACK_SIZE)} extra={Math.max(0, inGroup.length - STACK_SIZE)} />
                  <div className="min-w-24 flex-1 break-words">
                    <span className="text-sm font-medium text-hs-text-primary">{group.name}</span>
                    <p className="mt-1 text-xs text-hs-text-muted">{inGroup.length > 0 ? inGroup.map((member) => member.name).join(', ') : t('family.groups.noMembers')}</p>
                  </div>
                  <div className="flex shrink-0">
                    <Button variant="ghost" className="min-h-12 min-w-12 px-1" disabled={!editable} aria-label={t('family.groups.editName', { name: group.name })} onClick={() => beginGroupEdit(group)}><Pencil size={16} /></Button>
                    <Button variant="ghost" className="min-h-12 min-w-12 px-1 text-hs-danger" disabled={!editable} aria-label={t('family.groups.removeTitle', { name: group.name })} onClick={() => { const baseline = snapshot(); if (baseline) setDeletingGroup({ group, baseline, choreCount: definitions?.filter((chore) => chore.assigneeGroupIds?.includes(group.id)).length ?? 0 }); }}><Trash2 size={16} /></Button>
                  </div>
                </div>
              );
            })}
          </div>}
          {groupDraft ? (variant === 'mobile' ? <FormOverlay backDisabled={busy} title={t(groupDraft.isNew ? 'family.groups.add' : 'family.groups.edit')} dirty={JSON.stringify(groupDraft.group) !== JSON.stringify(groupDraft.initial)} onBack={() => { if (!busy) setGroupDraft(null); }}>{groupForm}</FormOverlay> : groupForm) : <Button className="flex min-h-12 items-center gap-2" disabled={!editable || members.length === 0 || groups.length >= FAMILY_LIMITS.maxGroups} onClick={() => beginGroupEdit()}><Plus size={16} />{t('family.groups.add')}</Button>}
          {groups.length >= FAMILY_LIMITS.maxGroups && <p className="text-xs text-hs-text-muted">{t('family.groups.limit', { count: FAMILY_LIMITS.maxGroups })}</p>}
          <p className="text-xs text-hs-text-muted">{t('family.groups.hint')}</p>
        </div>
      )}
      {deleting && <ConfirmRemove
        title={t('family.removeTitle', { name: deleting.member.name })}
        body={[deleting.choreCount !== undefined && t('family.removeChoreCount', { name: deleting.member.name, count: deleting.choreCount }), deleting.hasTimetable && t('family.removeTimetable', { name: deleting.member.name }), t('family.removeDescription', { name: deleting.member.name })].filter(Boolean).join(' ')}
        confirmLabel={t('family.remove')}
        variant={variant} busy={busy} onCancel={() => setDeleting(null)}
        onConfirm={() => void save(deleting.baseline, deleting.baseline.members.filter((member) => member.id !== deleting.member.id), [deleting.member.id])} />}
      {deletingGroup && <ConfirmRemove
        title={t('family.groups.removeTitle', { name: deletingGroup.group.name })}
        body={[deletingGroup.choreCount > 0 && t('family.groups.removeChoreCount', { name: deletingGroup.group.name, count: deletingGroup.choreCount }), t('family.groups.removeDescription', { name: deletingGroup.group.name })].filter(Boolean).join(' ')}
        confirmLabel={t('family.groups.remove')}
        variant={variant} busy={busy} onCancel={() => setDeletingGroup(null)}
        onConfirm={() => void saveGroups(deletingGroup.baseline, deletingGroup.baseline.groups.filter((group) => group.id !== deletingGroup.group.id))} />}
    </section>
  );
}
