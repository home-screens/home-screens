'use client';

import { useMemo, useState } from 'react';
import { useDebouncedSave } from '@/hooks/useDebouncedSave';
import {
  DndContext,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useEditorStore } from '@/stores/editor-store';
import { getDisplayProfiles, getActiveProfileId } from '@/lib/display-filter';
import Button from '@/components/ui/Button';
import { useFormattingLocale, useTranslate } from '@/i18n';
import { getLocalizedDayNames } from '@/lib/meal-constants';
import { useSortableSensors } from '@/hooks/useDndSensors';
import SortableProfileCard from './SortableProfileCard';
import { logger } from '@/lib/logger';

const log = logger('profiles');

/* ─── Main section ───────────────────────────── */

interface ProfilesSectionProps {
  /** When rendered as an Automation-page tab, the parent owns the shared
   *  display picker and the active tab already names the section — suppress
   *  this section's own picker and heading (the description still renders). */
  embedded?: boolean;
}

export default function ProfilesSection({ embedded = false }: ProfilesSectionProps) {
  const t = useTranslate('editor');
  const formattingLocale = useFormattingLocale();
  // Day-of-week labels follow the formatting locale (date-fns conventions),
  // not the UI language — ['Sun', 'Mon', …] for en-US, ['So.', 'Mo.', …]
  // for de-DE. Matches MealsSection's day handling. Memoized because the
  // parent re-renders on every dnd-kit drag tick — without this, each
  // computation runs 7 `formatDateSync` invocations per frame and the
  // fresh array reference defeats `React.memo` on children.
  const dayLabels = useMemo(
    () => getLocalizedDayNames(formattingLocale, 'short'),
    [formattingLocale],
  );

  const { config, selectedDisplayId, setSelectedDisplay, addProfile, reorderProfiles, setActiveProfile, saveConfig } = useEditorStore();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const sensors = useSortableSensors();

  // Auto-save the slice of config this section can mutate. `config.profiles`
  // is the shared pool, `config.displays` covers per-display owned profiles
  // (the actual storage target in multi-display installs), and
  // `config.settings.activeProfile` is the global active field. Debounced
  // 500ms so rapid drag reorders or schedule-day toggles collapse into a
  // single PUT. Replaces the old explicit "Save Profiles" button.
  useDebouncedSave({
    values: [config?.profiles, config?.displays, config?.settings.activeProfile],
    debounceMs: 500,
    // See the matching note in RulesSection: switching `?panel=` tabs unmounts
    // this section, and without a flush an edit inside the debounce window is
    // cancelled rather than saved.
    flushOnUnmount: true,
    save: () => saveConfig(),
    onError: (err) => log.error('Profile auto-save failed:', err),
  });

  if (!config) return null;

  // Profiles are per-display in multi-display mode. The data model
  // can't support a "shared definitions with per-display active picker"
  // split:
  // every profile references screen IDs, and screens are owned per-
  // display, so a profile only has meaning in the context of one
  // display's screen list. `addDisplay`'s bootstrap reflects this — it
  // copies `config.profiles` onto `display.profiles` for every new
  // display, after which the global pool is vestigial.
  //
  // So this page follows the editor's `selectedDisplayId` and edits
  // whichever display the user is currently working on. Single-display
  // installs see no change because `selectedDisplayId` is null and the
  // helpers fall through to `config.profiles` / `config.screens`.
  // The store's profile actions (`addProfile` etc.) already consult
  // `selectedDisplayId` via `resolveProfileTarget`, so reads and writes
  // stay in sync.
  const activeDisplay = selectedDisplayId
    ? config.displays?.find((d) => d.id === selectedDisplayId) ?? null
    : null;
  const profiles = activeDisplay
    ? getDisplayProfiles(activeDisplay, config.profiles)
    : config.profiles ?? [];
  const activeProfileId = getActiveProfileId(config, selectedDisplayId);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAdd = () => {
    addProfile(t('settings.profilesPage.newProfileName', { number: profiles.length + 1 }));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIndex = profiles.findIndex((p) => p.id === active.id);
    const toIndex = profiles.findIndex((p) => p.id === over.id);
    if (fromIndex !== -1 && toIndex !== -1) {
      reorderProfiles(fromIndex, toIndex);
    }
  };

  // Display picker for multi-display installs. Profiles are per-display
  // because they reference per-display screens, so the page needs an
  // explicit "which display am I editing?" affordance — without it the
  // user would have to switch displays in the canvas first, then come
  // back to the settings page, which is a confusing workflow. Hidden
  // in single-display
  // mode where there's only one possible answer.
  const allDisplays = config.displays ?? [];
  const isMultiDisplay = allDisplays.length > 0;

  return (
    <section>
      {!embedded && (
        <h3 className="text-sm font-medium text-hs-text-secondary mb-3 uppercase tracking-wider">
          {t('settings.profilesPage.heading')}
        </h3>
      )}
      <p className="text-xs text-hs-text-faint mb-4">
        {t('settings.profilesPage.description')}
      </p>

      {isMultiDisplay && !embedded && (
        <div className="mb-4 rounded-lg border border-hs-accent/20 bg-hs-accent/[0.07] px-3 py-2.5">
          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-hs-accent-hover font-medium">
              {t('settings.profilesPage.displayPicker.label')}
            </span>
            <select
              value={selectedDisplayId ?? allDisplays[0]?.id ?? ''}
              onChange={(e) => setSelectedDisplay(e.target.value || null)}
              className="mt-1 block w-full rounded-md bg-hs-panel border border-hs-border-strong text-sm text-hs-text-body px-3 py-2 focus:outline-none focus:border-hs-accent"
            >
              {allDisplays.map((d) => (
                <option key={d.id} value={d.id}>
                  {t('settings.profilesPage.displayPicker.optionLabel', { name: d.name, id: d.id })}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-hs-text-faint mt-1.5">
              {t('settings.profilesPage.displayPicker.help')}
            </p>
          </label>
        </div>
      )}

      {/* Active profile selector */}
      {profiles.length > 0 && (
        <label className="block mb-4" data-field-id="profiles.activeProfile">
          <span className="text-xs text-hs-text-muted">
            {t('settings.profilesPage.active.label')}
          </span>
          <select
            value={activeProfileId ?? ''}
            onChange={(e) => setActiveProfile(e.target.value || undefined)}
            className="block w-full rounded-md bg-hs-card border border-hs-border-strong text-sm text-hs-text-body px-3 py-2 focus:outline-none focus:border-hs-accent mt-1"
          >
            <option value="">{t('settings.profilesPage.active.noneOption')}</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <p className="text-xs text-hs-text-faint mt-1">
            {t('settings.profilesPage.active.help')}
          </p>
        </label>
      )}

      {/* Priority note */}
      {profiles.length > 1 && (
        <div className="rounded-md bg-hs-card/60 border border-hs-border-strong/50 px-3 py-2 mb-4">
          <p className="text-xs text-hs-text-muted">
            <span className="font-medium text-hs-text-secondary">
              {t('settings.profilesPage.priority.labelPrefix')}
            </span>
            {t('settings.profilesPage.priority.helpSuffix')}
          </p>
        </div>
      )}

      {/* Sortable profile list */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={profiles.map((p) => p.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {profiles.map((profile, index) => (
              <SortableProfileCard
                key={profile.id}
                profile={profile}
                index={index}
                isExpanded={expandedIds.has(profile.id)}
                onToggleExpand={() => toggleExpand(profile.id)}
                t={t}
                dayLabels={dayLabels}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <div className="flex items-center gap-3 mt-4">
        <Button variant="secondary" onClick={handleAdd}>
          {t('settings.profilesPage.addButton')}
        </Button>
        {/* Save button removed — auto-save means every profile mutation
            persists via the useDebouncedSave hook at the top of this
            component. Status feedback lives in the parent settings page's
            header indicator which subscribes to the store's `isSaving` flag. */}
      </div>
    </section>
  );
}
