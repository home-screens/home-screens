'use client';

import { CalendarDays, Images, ListChecks, ListTodo, MessageSquareText, UtensilsCrossed } from 'lucide-react';
import { useTranslate } from '@/i18n';
import { useOrigin } from '@/hooks/useOrigin';
import EmptyState from './EmptyState';

/** The tabs (and the Notes tab's Calendar page) that depend on a module existing somewhere in the config. */
export type GatedTab = 'chores' | 'lists' | 'notes' | 'dayNotes' | 'meals' | 'photos';

const ICONS = {
  chores: ListChecks,
  lists: ListTodo,
  notes: MessageSquareText,
  dayNotes: CalendarDays,
  meals: UtensilsCrossed,
  photos: Images,
} as const;

/**
 * What a family tab shows before the matching module exists anywhere.
 *
 * The tabs used to disappear instead. A parent who installed Home Screens for
 * the chore chart then opened `/remote` on their phone, found only Control and
 * Timers, and read the silence as "chores are not included". Keeping the tab
 * and explaining the gap costs one screen and answers the question.
 */
export default function TabNotSetUp({ kind }: { kind: GatedTab }) {
  const t = useTranslate('remote');
  const origin = useOrigin();
  // Scheme stripped: this is an address someone types on another device, and
  // "http://" is noise in front of the part that matters.
  const editorUrl = `${origin.replace(/^https?:\/\//, '')}/editor`;

  const [before, after] = t('tabNotSetUp.howTo').split('{url}');

  return (
    <EmptyState
      icon={ICONS[kind]}
      title={t(`tabNotSetUp.${kind}.title`)}
      body={t(`tabNotSetUp.${kind}.body`)}
      style={{ paddingBottom: 64 }}
      action={(
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.45, color: 'var(--hs-text-faint)' }}>
          {before}
          <span style={{ fontWeight: 600, color: 'var(--hs-text-muted)', whiteSpace: 'nowrap' }}>{editorUrl}</span>
          {after}
        </p>
      )}
    />
  );
}
