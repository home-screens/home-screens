'use client';

import { useId, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2, Users } from 'lucide-react';
import Button from '@/components/ui/Button';
import ChoreIcon, { MEMBER_ICONS } from '@/components/modules/chore-chart/ChoreIcon';
import IconPicker from '@/components/modules/chore-chart/IconPicker';
import MobileColorPicker from '@/app/(remote)/remote/components/MobileColorPicker';
import FormOverlay from '@/app/(remote)/remote/components/FormOverlay';
import { useFetchData } from '@/hooks/useFetchData';
import { choresDataUrl } from '@/lib/fetch-keys';
import type { ChoreDefinition } from '@/types/config';
import { useFamilyData, publishFamilyData, type FamilySnapshot } from '@/hooks/useFamilyData';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { editorFetch } from '@/lib/editor-fetch';
import { uuid } from '@/lib/uuid';
import { useTranslate } from '@/i18n';
import { FAMILY_LIMITS, MEMBER_COLORS, type FamilyMember } from '@/types/family';

const PAGE_SIZE = 12;
interface Draft { member: FamilyMember; initial: FamilyMember; baseline: FamilySnapshot; isNew: boolean }
type Variant = 'desktop' | 'mobile';

function DeleteConfirmation({ name, choreCount, variant, busy, onCancel, onConfirm }: {
  name: string; choreCount?: number; variant: Variant; busy: boolean; onCancel: () => void; onConfirm: () => void;
}) {
  const t = useTranslate('core');
  const ref = useFocusTrap<HTMLDivElement>();
  const id = useId();
  return (
    <div className={`fixed inset-0 z-[160] flex justify-center bg-black/60 ${variant === 'mobile' ? 'items-end' : 'items-center p-5'}`} role="alertdialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-body`}>
      <div ref={ref} className={`w-full border border-hs-border bg-hs-panel p-5 shadow-xl ${variant === 'mobile' ? 'max-w-[640px] rounded-t-2xl pb-[max(20px,env(safe-area-inset-bottom))]' : 'max-w-sm rounded-2xl'}`} onKeyDown={(event) => { if (event.key === 'Escape' && !busy) onCancel(); }}>
        <h3 id={`${id}-title`} className="font-semibold text-hs-text-primary">{t('family.removeTitle', { name })}</h3>
        <p id={`${id}-body`} className="mt-3 text-sm leading-relaxed text-hs-text-muted">{choreCount !== undefined && <>{t('family.removeChoreCount', { name, count: choreCount })} </>}{t('family.removeDescription', { name })}</p>
        <div className={`mt-5 flex gap-2 ${variant === 'mobile' ? 'flex-col' : 'justify-end'}`}>
          <Button className="min-h-12" disabled={busy} onClick={onCancel}>{t('actions.cancel')}</Button>
          <Button className="min-h-12" variant="danger" disabled={busy} onClick={onConfirm}>{t('family.remove')}</Button>
        </div>
      </div>
    </div>
  );
}

/** One revision-checked roster editor, used by the editor and the phone. */
export default function FamilyManager({ onChanged, variant = 'desktop', chores }: { onChanged?: () => void; variant?: Variant; chores?: readonly ChoreDefinition[] } = {}) {
  const t = useTranslate('core');
  const { members, revision, loading, error, refresh } = useFamilyData();
  const [choreData] = useFetchData<{ chores: ChoreDefinition[] }>(chores ? '' : choresDataUrl(), 60_000);
  const definitions = chores ?? choreData?.chores;
  const choreCounts = useMemo(() => definitions && new Map(members.map((member) => [member.id, definitions.filter((chore) => chore.assigneeIds.includes(member.id) || Object.hasOwn(chore.schedule ?? {}, member.id)).length])), [members, definitions]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [deleting, setDeleting] = useState<{ member: FamilyMember; baseline: FamilySnapshot; choreCount?: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const formId = useId();
  const pageCount = Math.max(1, Math.ceil(members.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const editable = revision !== null && !busy && !draft && !deleting;

  async function save(baseline: FamilySnapshot, next: FamilyMember[], removedIds: string[] = []) {
    setBusy(true);
    setNotice(null);
    try {
      const response = await editorFetch('/api/family', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ members: next, revision: baseline.revision, removedIds }),
      });
      const result = await response.json();
      if (response.status === 409) {
        if (Array.isArray(result.members) && typeof result.revision === 'string') publishFamilyData(result);
        else refresh();
        // The baseline is no longer valid. A fresh, deliberate edit is required.
        setDraft(null);
        setDeleting(null);
        setNotice(t('family.conflict'));
        return;
      }
      if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : t('family.saveFailed'));
      publishFamilyData(result as FamilySnapshot);
      setDraft(null);
      setDeleting(null);
      setNotice(t('family.saved'));
      onChanged?.();
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : t('family.saveFailed'));
      setDeleting(null);
    } finally {
      setBusy(false);
    }
  }

  function beginEdit(member?: FamilyMember) {
    if (!revision) return;
    setNotice(null);
    const now = new Date().toISOString();
    const initial = member ? { ...member } : { id: uuid(), name: '', color: MEMBER_COLORS[members.length % MEMBER_COLORS.length], emoji: '', createdAt: now, updatedAt: now };
    setDraft({ baseline: { members, revision }, isNew: !member, member: initial, initial });
  }

  function reorder(index: number, direction: -1 | 1) {
    if (!revision) return;
    const next = [...members];
    [next[index], next[index + direction]] = [next[index + direction], next[index]];
    void save({ members, revision }, next);
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
          <IconPicker value={draft.member.emoji ?? ''} onChange={(emoji) => setDraft({ ...draft, member: { ...draft.member, emoji } })} icons={MEMBER_ICONS} label={t('actions.icon')} variant={variant} />
          <div className="min-w-0">
            <label className="mb-1 block text-sm text-hs-text-muted" htmlFor={`${formId}-emoji`}>{t('family.emoji')}</label>
            <input id={`${formId}-emoji`} disabled={busy} maxLength={16} value={draft.member.emoji?.startsWith('lucide:') ? '' : draft.member.emoji ?? ''} onChange={(event) => setDraft({ ...draft, member: { ...draft.member, emoji: event.target.value } })} className="min-h-12 w-full rounded-lg border border-hs-border-strong bg-hs-panel px-3 text-hs-text-primary" />
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
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg" style={{ backgroundColor: `${member.color}25`, color: member.color }}>{member.emoji ? <ChoreIcon value={member.emoji} color={member.color} size={24} bare /> : member.name.slice(0, 1)}</span>
              <div className="min-w-24 flex-1 break-words"><span className="text-sm font-medium text-hs-text-primary">{member.name}</span>{choreCounts && <p className="mt-1 text-xs text-hs-text-muted">{t('family.choreCount', { count: choreCounts.get(member.id) ?? 0 })}</p>}</div>
              <div className="flex shrink-0">
                <Button variant="ghost" className="min-h-12 min-w-12 px-1" disabled={!editable || index === 0} aria-label={t('family.moveUp', { name: member.name })} onClick={() => reorder(index, -1)}><ArrowUp size={16} /></Button>
                <Button variant="ghost" className="min-h-12 min-w-12 px-1" disabled={!editable || index === members.length - 1} aria-label={t('family.moveDown', { name: member.name })} onClick={() => reorder(index, 1)}><ArrowDown size={16} /></Button>
                <Button variant="ghost" className="min-h-12 min-w-12 px-1" disabled={!editable} aria-label={t('family.editName', { name: member.name })} onClick={() => beginEdit(member)}><Pencil size={16} /></Button>
                <Button variant="ghost" className="min-h-12 min-w-12 px-1 text-hs-danger" disabled={!editable} aria-label={t('family.removeTitle', { name: member.name })} onClick={() => setDeleting({ member, baseline: { members, revision: revision! }, choreCount: choreCounts?.get(member.id) })}><Trash2 size={16} /></Button>
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
      {deleting && <DeleteConfirmation name={deleting.member.name} choreCount={deleting.choreCount} variant={variant} busy={busy} onCancel={() => setDeleting(null)} onConfirm={() => void save(deleting.baseline, deleting.baseline.members.filter((member) => member.id !== deleting.member.id), [deleting.member.id])} />}
    </section>
  );
}
