'use client';

import { useState } from 'react';
import Button from '@/components/ui/Button';
import LabeledInput from '@/components/ui/LabeledInput';
import LabeledSelect from '@/components/ui/LabeledSelect';
import Slider from '@/components/ui/Slider';
import Toggle from '@/components/ui/Toggle';
import ViewSelect from '@/components/editor/ViewSelect';
import PhoneSurfaceLinks from '@/components/editor/PhoneSurfaceLinks';
import NotesBoardModal from '@/components/editor/NotesBoardModal';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { isMaterialView } from '@/lib/notes-rules';
import { useTranslate } from '@/i18n';
import type { ModuleInstance, NotesConfig, NotesFilter, NotesView } from '@/types/config';

// Which views read which field, from the NotesConfig JSDoc. The editor shows
// only the controls the chosen view honours.
const NO_HEADING: ReadonlySet<NotesView> = new Set(['strip', 'ticker', 'count', 'latest', 'letterboard', 'fridge', 'notebook', 'neon']);
const READS_MAX_NOTES: ReadonlySet<NotesView> = new Set([
  'board', 'cards', 'sticky', 'bubbles', 'compact', 'timeline', 'focus', 'pinned-new',
  'chalkboard', 'whiteboard', 'fridge', 'notebook', 'receipt', 'headline',
]);
const READS_STEP_SECONDS: ReadonlySet<NotesView> = new Set(['spotlight', 'strip', 'letterboard', 'neon']);
const NO_AUTHOR_OR_AGE: ReadonlySet<NotesView> = new Set(['count', 'by-person']);
const NO_FILTER: ReadonlySet<NotesView> = new Set(['timeline', 'by-person']);

export function NotesConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const { config: c, set } = useModuleConfig<Partial<NotesConfig>>(mod, screenId);
  const t = useTranslate('editor');
  const tModules = useTranslate('modules');
  const view = c.view ?? 'board';
  const [showModal, setShowModal] = useState(false);

  const VIEWS: { value: NotesView; label: string; group?: string }[] = [
    { value: 'board', label: t('configSections.notes.viewBoard'), group: t('configSections.notes.groupLayouts') },
    { value: 'cards', label: t('configSections.notes.viewCards'), group: t('configSections.notes.groupLayouts') },
    { value: 'sticky', label: t('configSections.notes.viewSticky'), group: t('configSections.notes.groupLayouts') },
    { value: 'bubbles', label: t('configSections.notes.viewBubbles'), group: t('configSections.notes.groupLayouts') },
    { value: 'spotlight', label: t('configSections.notes.viewSpotlight'), group: t('configSections.notes.groupLayouts') },
    { value: 'compact', label: t('configSections.notes.viewCompact'), group: t('configSections.notes.groupLayouts') },
    { value: 'count', label: t('configSections.notes.viewCount'), group: t('configSections.notes.groupLayouts') },
    { value: 'strip', label: t('configSections.notes.viewStrip'), group: t('configSections.notes.groupLayouts') },
    { value: 'ticker', label: t('configSections.notes.viewTicker'), group: t('configSections.notes.groupLayouts') },
    { value: 'timeline', label: t('configSections.notes.viewTimeline'), group: t('configSections.notes.groupLayouts') },
    { value: 'focus', label: t('configSections.notes.viewFocus'), group: t('configSections.notes.groupLayouts') },
    { value: 'by-person', label: t('configSections.notes.viewByPerson'), group: t('configSections.notes.groupLayouts') },
    { value: 'pinned-new', label: t('configSections.notes.viewPinnedNew'), group: t('configSections.notes.groupLayouts') },
    { value: 'latest', label: t('configSections.notes.viewLatest'), group: t('configSections.notes.groupLayouts') },
    { value: 'chalkboard', label: t('configSections.notes.viewChalkboard'), group: t('configSections.notes.groupMaterials') },
    { value: 'letterboard', label: t('configSections.notes.viewLetterboard'), group: t('configSections.notes.groupMaterials') },
    { value: 'whiteboard', label: t('configSections.notes.viewWhiteboard'), group: t('configSections.notes.groupMaterials') },
    { value: 'fridge', label: t('configSections.notes.viewFridge'), group: t('configSections.notes.groupMaterials') },
    { value: 'notebook', label: t('configSections.notes.viewNotebook'), group: t('configSections.notes.groupMaterials') },
    { value: 'receipt', label: t('configSections.notes.viewReceipt'), group: t('configSections.notes.groupMaterials') },
    { value: 'neon', label: t('configSections.notes.viewNeon'), group: t('configSections.notes.groupMaterials') },
    { value: 'headline', label: t('configSections.notes.viewHeadline'), group: t('configSections.notes.groupMaterials') },
  ];

  const FILTERS: { value: NotesFilter; label: string }[] = [
    { value: 'all', label: t('configSections.notes.filterAll') },
    { value: 'pinned', label: t('configSections.notes.filterPinned') },
    { value: 'important', label: t('configSections.notes.filterImportant') },
  ];

  return (
    <div className="space-y-2">
      <Button size="sm" variant="primary" className="w-full" onClick={() => setShowModal(true)}>
        {t('configSections.notes.manageNotes')}
      </Button>

      <ViewSelect
        value={view}
        onChange={(v) => set({ view: v })}
        options={VIEWS}
      />
      {isMaterialView(view) && (
        <p className="text-[11px] text-hs-text-faint leading-relaxed">{t('configSections.notes.materialHelp')}</p>
      )}

      {!NO_HEADING.has(view) && (
        <>
          <LabeledInput
            label={t('configSections.notes.title')}
            value={c.title ?? ''}
            placeholder={view === 'headline' ? tModules('notes.masthead') : t('configSections.notes.defaultTitle')}
            onChange={(v) => set({ title: v })}
          />
          <Toggle
            label={t('configSections.notes.showTitle')}
            checked={c.showTitle ?? true}
            onChange={(v) => set({ showTitle: v })}
          />
        </>
      )}

      {!NO_FILTER.has(view) && (
        <LabeledSelect
          label={t('configSections.notes.filter')}
          value={c.filter ?? 'all'}
          onChange={(v) => set({ filter: v })}
          options={FILTERS}
        />
      )}

      {READS_MAX_NOTES.has(view) && (
        <Slider
          label={t('configSections.notes.maxNotes')}
          value={c.maxNotes ?? 5}
          min={1}
          max={20}
          onChange={(v) => set({ maxNotes: v })}
        />
      )}

      {READS_STEP_SECONDS.has(view) && (
        <Slider
          label={t('configSections.notes.stepSeconds')}
          value={c.stepSeconds ?? 10}
          min={5}
          max={60}
          onChange={(v) => set({ stepSeconds: v })}
        />
      )}

      {view === 'ticker' && (
        <Slider
          label={t('configSections.notes.tickerSpeed')}
          value={c.tickerSpeed ?? 8}
          min={3}
          max={30}
          onChange={(v) => set({ tickerSpeed: v })}
        />
      )}

      {!NO_AUTHOR_OR_AGE.has(view) && (
        <>
          <Toggle
            label={t('configSections.notes.showAuthor')}
            checked={c.showAuthor ?? true}
            onChange={(v) => set({ showAuthor: v })}
          />
          <Toggle
            label={t('configSections.notes.showAge')}
            checked={c.showAge ?? true}
            onChange={(v) => set({ showAge: v })}
          />
        </>
      )}

      {/* Notes are family data: written here with Manage notes, or on a phone in the Notes tab. */}
      <PhoneSurfaceLinks context="notes" />

      {showModal && <NotesBoardModal onClose={() => setShowModal(false)} />}
    </div>
  );
}
