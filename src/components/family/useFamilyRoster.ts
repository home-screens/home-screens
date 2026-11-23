'use client';

import { useEffect, useMemo, useState } from 'react';
import { useFetchData } from '@/hooks/useFetchData';
import { choresDataUrl, timetablesUrl } from '@/lib/fetch-keys';
import type { ChoreDefinition } from '@/types/config';
import type { Timetable, TimetableData } from '@/types/timetables';
import { useFamilyData, publishFamilyData, type FamilySnapshot } from '@/hooks/useFamilyData';
import { editorFetch } from '@/lib/editor-fetch';
import { readJson, refusalText } from '@/lib/hub-request';
import { uuid } from '@/lib/uuid';
import { useTranslate } from '@/i18n';
import { MEMBER_COLORS, type FamilyGroup, type FamilyMember } from '@/types/family';
import { groupDraftProblem } from '@/lib/family-groups';
import { groupChoreCount, groupsAfterSave, memberChoreCounts, membersAfterMove, membersAfterSave, memberToSave } from '@/lib/family-roster';

export const FAMILY_PAGE_SIZE = 12;

export interface MemberDraft { member: FamilyMember; initial: FamilyMember; baseline: FamilySnapshot; isNew: boolean }
export interface GroupDraft { group: FamilyGroup; initial: FamilyGroup; baseline: FamilySnapshot; isNew: boolean }

/** A remove waiting on its question: the words to ask with, and what a yes does. */
export interface Removal {
  title: string;
  body: string;
  confirmLabel: string;
  run: () => Promise<void>;
}

/**
 * The family roster's state and checked writes, behind both Family screens:
 * the editor's (`FamilyManager`) and the phone's (`PhoneFamilyManager`).
 * Each draws its own list, forms and questions; this holds the drafts, the
 * page, the remove waiting on an answer, and the one revision-checked save
 * for people and groups. What an edit sends is `lib/family-roster.ts`.
 */
export function useFamilyRoster({ onChanged, onEditingChange, chores, timetables }: {
  onChanged?: () => void;
  onEditingChange?: (editing: boolean) => void;
  chores?: readonly ChoreDefinition[];
  timetables?: readonly Timetable[];
}) {
  const t = useTranslate('core');
  const { members, groups, revision, loading, error, refresh } = useFamilyData();
  const [choreData] = useFetchData<{ chores: ChoreDefinition[] }>(chores ? '' : choresDataUrl(), 60_000);
  const definitions = chores ?? choreData?.chores;
  const choreCounts = useMemo(() => definitions && memberChoreCounts(members, groups, definitions), [members, groups, definitions]);
  const [timetableData] = useFetchData<{ data: TimetableData }>(timetables ? '' : timetablesUrl(), 60_000);
  const savedTimetables = timetables ?? timetableData?.data?.timetables;
  const hasTimetable = useMemo(() => savedTimetables && new Set(savedTimetables.map((timetable) => timetable.memberId)), [savedTimetables]);

  const [draft, setDraft] = useState<MemberDraft | null>(null);
  const [groupDraft, setGroupDraft] = useState<GroupDraft | null>(null);
  const [removal, setRemoval] = useState<Removal | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const editing = draft !== null || groupDraft !== null || removal !== null;
  useEffect(() => { onEditingChange?.(editing); }, [editing, onEditingChange]);

  const pageCount = Math.max(1, Math.ceil(members.length / FAMILY_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const editable = revision !== null && !busy && !editing;
  const snapshot = (): FamilySnapshot | null => (revision ? { members, groups, revision } : null);

  function closeForms() {
    setDraft(null);
    setGroupDraft(null);
    setRemoval(null);
  }

  /**
   * One checked write for both lists. A refusal is shown in the household's
   * language from its code (`refusals.family`); one that carries the hub's
   * roster (somebody else saved first, a group names someone who left)
   * adopts it and asks for the edit again.
   */
  async function submit(url: string, body: Record<string, unknown>, savedKey: string, failedKey: string) {
    setBusy(true);
    setNotice(null);
    try {
      const response = await editorFetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const result = (await readJson(response)) as Record<string, unknown> | null;
      if (response.status === 409) {
        if (result && Array.isArray(result.members) && typeof result.revision === 'string') publishFamilyData({ ...result, groups: Array.isArray(result.groups) ? result.groups : [] } as FamilySnapshot);
        else refresh();
        // The baseline is no longer valid. A fresh, deliberate edit is required.
        closeForms();
        setNotice(refusalText(result, t, 'refusals.family.revision'));
        return;
      }
      if (!response.ok) {
        setNotice(refusalText(result, t, failedKey));
        setRemoval(null);
        return;
      }
      publishFamilyData(result as unknown as FamilySnapshot);
      closeForms();
      setNotice(t(savedKey));
      onChanged?.();
    } catch (cause) {
      setNotice(refusalText(cause, t, failedKey, 'refusals.hubUnreachable'));
      setRemoval(null);
    } finally {
      setBusy(false);
    }
  }

  function save(baseline: FamilySnapshot, next: FamilyMember[], removedIds: string[] = []) {
    return submit('/api/family', { members: next, revision: baseline.revision, removedIds }, 'family.saved', 'refusals.saveFailed');
  }

  function saveGroups(baseline: FamilySnapshot, next: FamilyGroup[]) {
    const body = next.map(({ id, name, memberIds }) => ({ id, name, memberIds }));
    return submit('/api/family/groups', { groups: body, revision: baseline.revision }, 'family.groups.saved', 'refusals.saveFailed');
  }

  function beginEdit(member?: FamilyMember) {
    if (!revision) return;
    setNotice(null);
    const now = new Date().toISOString();
    const initial = member ? { ...member } : { id: uuid(), name: '', color: MEMBER_COLORS[members.length % MEMBER_COLORS.length], emoji: '', createdAt: now, updatedAt: now };
    setDraft({ baseline: { members, groups, revision }, isNew: !member, member: initial, initial });
  }

  function beginGroupEdit(group?: FamilyGroup) {
    const baseline = snapshot();
    if (!baseline) return;
    setNotice(null);
    const now = new Date().toISOString();
    const initial = group ? { ...group, memberIds: [...group.memberIds] } : { id: uuid(), name: '', memberIds: [], createdAt: now, updatedAt: now };
    setGroupDraft({ baseline, isNew: !group, group: initial, initial });
  }

  function saveDraft() {
    if (!draft || busy || !draft.member.name.trim()) return;
    const member = memberToSave(draft.member, draft.baseline.members);
    void save(draft.baseline, membersAfterSave(draft.baseline.members, member, draft.isNew));
  }

  const groupProblem = groupDraft
    ? groupDraftProblem(groupDraft.group, members, groupDraft.baseline.groups.filter((group) => group.id !== groupDraft.group.id).map((group) => group.name))
    : null;

  function saveGroupDraft() {
    if (!groupDraft || busy || groupProblem) return;
    void saveGroups(groupDraft.baseline, groupsAfterSave(groupDraft.baseline.groups, groupDraft.group, groupDraft.isNew));
  }

  function move(index: number, direction: -1 | 1) {
    if (!revision) return;
    void save({ members, groups, revision }, membersAfterMove(members, index, direction));
  }

  /** The question for removing a person, saying what goes with them, and the remove a yes runs. */
  function memberRemoval(member: FamilyMember): Removal | null {
    const baseline = snapshot();
    if (!baseline) return null;
    const choreCount = choreCounts?.get(member.id);
    const body = [
      !!choreCount && t('family.removeChoreCount', { name: member.name, count: choreCount }),
      hasTimetable?.has(member.id) && t('family.removeTimetable', { name: member.name }),
      t('family.removeDescription', { name: member.name }),
    ].filter(Boolean).join(' ');
    return {
      title: t('family.removeTitle', { name: member.name }),
      body,
      confirmLabel: t('family.remove'),
      run: () => save(baseline, baseline.members.filter((existing) => existing.id !== member.id), [member.id]),
    };
  }

  /** The question for removing a group, and the remove a yes runs. */
  function groupRemoval(group: FamilyGroup): Removal | null {
    const baseline = snapshot();
    if (!baseline) return null;
    const choreCount = groupChoreCount(group, definitions);
    const body = [
      choreCount > 0 && t('family.groups.removeChoreCount', { name: group.name, count: choreCount }),
      t('family.groups.removeDescription', { name: group.name }),
    ].filter(Boolean).join(' ');
    return {
      title: t('family.groups.removeTitle', { name: group.name }),
      body,
      confirmLabel: t('family.groups.remove'),
      run: () => saveGroups(baseline, baseline.groups.filter((existing) => existing.id !== group.id)),
    };
  }

  return {
    members, groups, loading, error, refresh,
    choreCounts, hasTimetable,
    draft, setDraft, saveDraft,
    groupDraft, setGroupDraft, saveGroupDraft, groupProblem,
    removal, setRemoval, memberRemoval, groupRemoval,
    busy, notice, editable,
    page: currentPage, pageCount, setPage,
    beginEdit, beginGroupEdit, move,
  };
}

export type FamilyRoster = ReturnType<typeof useFamilyRoster>;
