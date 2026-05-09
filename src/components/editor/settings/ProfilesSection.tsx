'use client';

import { useMemo, useState } from 'react';
import { useDebouncedSave } from '@/hooks/useDebouncedSave';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, GripVertical, Pencil, Trash2, Check, X } from 'lucide-react';
import { useEditorStore, getActiveScreens } from '@/stores/editor-store';
import { getDisplayProfiles } from '@/lib/display-filter';
import { useConfirmStore } from '@/stores/confirm-store';
import Toggle from '@/components/ui/Toggle';
import Button from '@/components/ui/Button';
import { useFormattingLocale, useTranslate, type TranslateFn } from '@/i18n';
import { getLocalizedDayNames } from '@/lib/meal-constants';
import type { ModuleSchedule, Profile } from '@/types/config';

const TIME_CLASS =
  'mt-1 block w-full rounded-md bg-hs-card border border-hs-border-strong text-sm text-hs-text-body px-3 py-2 focus:outline-none focus:border-hs-accent';

/* ─── Sortable screen row (inside profile) ──── */

interface SortableScreenRowProps {
  screenId: string;
  screenName: string;
  screenEnabled?: boolean;
  onRemove: () => void;
  t: TranslateFn;
}

function SortableScreenRow({ screenId, screenName, screenEnabled, onRemove, t }: SortableScreenRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: screenId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
    opacity: isDragging ? 0.5 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-md bg-hs-card/60 px-2 py-1.5"
    >
      <button
        type="button"
        className="cursor-grab touch-none text-hs-text-faint hover:text-hs-text-muted transition-colors"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-3.5 h-3.5" />
      </button>
      <span className="flex-1 text-sm text-hs-text-secondary truncate">
        {screenName}
        {screenEnabled === false && (
          <span className="ml-1 text-[10px] text-hs-warning/70">
            {t('settings.profilesPage.card.disabledLabel')}
          </span>
        )}
      </span>
      <button
        type="button"
        onClick={onRemove}
        className="text-hs-text-faint hover:text-hs-danger transition-colors"
        title={t('settings.profilesPage.card.removeFromProfileTitle')}
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

/* ─── Sortable profile card ──────────────────── */

interface ProfileCardProps {
  profile: Profile;
  index: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
  t: TranslateFn;
  dayLabels: string[];
}

function SortableProfileCard({ profile, index, isExpanded, onToggleExpand, t, dayLabels }: ProfileCardProps) {
  const { config, selectedDisplayId, updateProfile, removeProfile } = useEditorStore();
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: profile.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
    opacity: isDragging ? 0.5 : undefined,
  };

  // DnD sensors for the nested screen reorder list
  const screenSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (!config) return null;

  // Profiles reference screens by ID, and screens are owned per-display
  // in multi-display mode (every DisplayNode has its own `screens` list).
  // So a profile defined for Kitchen references kitchen.screens, not the
  // legacy global pool. We follow the editor's `selectedDisplayId` so the
  // screen list and the profile's screen membership both reflect the
  // currently-active display. In single-display mode this resolves to
  // `config.screens` automatically.
  const screens = getActiveScreens(config, selectedDisplayId);
  // activeProfile sits on the DisplayNode when the display owns its
  // profiles, otherwise it lives on the global settings. Match what
  // filterConfigForDisplay / api/display/profile do.
  const activeDisplay = selectedDisplayId
    ? config.displays?.find((d) => d.id === selectedDisplayId)
    : null;
  const activeProfileId = activeDisplay && activeDisplay.profiles
    ? activeDisplay.activeProfile
    : config.settings.activeProfile;

  // Screens included in this profile (in profile order)
  const includedScreens = profile.screenIds
    .map((id) => screens.find((s) => s.id === id))
    .filter((s): s is typeof screens[number] => !!s);

  // Screens not in this profile (available to add)
  const includedSet = new Set(profile.screenIds);
  const availableScreens = screens.filter((s) => !includedSet.has(s.id));

  const commitRename = () => {
    const trimmed = renameValue.trim();
    if (trimmed) updateProfile(profile.id, { name: trimmed });
    setRenamingId(null);
  };

  const addScreen = (screenId: string) => {
    updateProfile(profile.id, { screenIds: [...profile.screenIds, screenId] });
  };

  const removeScreen = (screenId: string) => {
    updateProfile(profile.id, { screenIds: profile.screenIds.filter((id) => id !== screenId) });
  };

  const validScreenIds = includedScreens.map((s) => s.id);

  const handleScreenDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIndex = validScreenIds.indexOf(active.id as string);
    const toIndex = validScreenIds.indexOf(over.id as string);
    if (fromIndex === -1 || toIndex === -1) return;
    const next = [...validScreenIds];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    updateProfile(profile.id, { screenIds: next });
  };

  const setSchedule = (updates: Partial<ModuleSchedule>) => {
    updateProfile(profile.id, { schedule: { ...profile.schedule, ...updates } });
  };

  const toggleSchedule = (enabled: boolean) => {
    if (enabled) {
      updateProfile(profile.id, { schedule: { daysOfWeek: [1, 2, 3, 4, 5] } });
    } else {
      updateProfile(profile.id, { schedule: undefined });
    }
  };

  const toggleDay = (day: number) => {
    const current = profile.schedule?.daysOfWeek ?? [0, 1, 2, 3, 4, 5, 6];
    const next = current.includes(day) ? current.filter((d) => d !== day) : [...current, day].sort();
    if (next.length === 0) return;
    setSchedule({ daysOfWeek: next });
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded-lg border border-hs-border-strong bg-hs-hover overflow-hidden"
    >
      {/* Collapsed header — always visible */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          className="cursor-grab touch-none text-hs-text-faint hover:text-hs-text-muted transition-colors"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={onToggleExpand}
          className="shrink-0"
        >
          <ChevronDown
            className={`w-4 h-4 text-hs-text-faint transition-transform ${isExpanded ? '' : '-rotate-90'}`}
          />
        </button>

        {renamingId === profile.id ? (
          <div className="flex flex-1 items-center gap-1.5 min-w-0">
            <input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
                if (e.key === 'Escape') setRenamingId(null);
              }}
              autoFocus
              className="w-40 rounded border border-hs-border-strong bg-hs-panel px-2 py-0.5 text-sm text-hs-text-body outline-none focus:border-hs-accent"
            />
            <button type="button" onClick={commitRename} className="text-hs-success hover:text-hs-success/80">
              <Check className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={() => setRenamingId(null)} className="text-hs-text-faint hover:text-hs-text-secondary">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onToggleExpand}
            className="flex flex-1 items-center gap-2 min-w-0"
          >
            <span className="text-sm font-medium text-hs-text-body truncate">{profile.name}</span>
            {activeProfileId === profile.id && (
              <span className="text-[10px] uppercase tracking-wider text-hs-accent-hover bg-hs-accent-soft px-1.5 py-0.5 rounded shrink-0">
                {t('settings.profilesPage.card.activeBadge')}
              </span>
            )}
            {profile.schedule && (
              <span className="text-[10px] uppercase tracking-wider text-hs-success bg-hs-success/10 px-1.5 py-0.5 rounded shrink-0">
                {t('settings.profilesPage.card.scheduledBadge')}
              </span>
            )}
          </button>
        )}

        <span className="text-[11px] text-hs-text-faint tabular-nums shrink-0">#{index + 1}</span>

        <button
          onClick={(e) => {
            e.stopPropagation();
            setRenamingId(profile.id);
            setRenameValue(profile.name);
          }}
          className="text-hs-text-faint hover:text-hs-text-secondary transition-colors shrink-0"
          title={t('settings.profilesPage.card.renameTitle')}
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={async (e) => {
            e.stopPropagation();
            const ok = await useConfirmStore.getState().confirm({
              title: t('settings.profilesPage.deleteDialog.title'),
              message: t('settings.profilesPage.deleteDialog.message', { name: profile.name }),
              confirmLabel: t('settings.profilesPage.deleteDialog.confirm'),
            });
            if (ok) {
              removeProfile(profile.id);
            }
          }}
          className="text-hs-text-faint hover:text-hs-danger transition-colors shrink-0"
          title={t('settings.profilesPage.card.deleteTitle')}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Expanded body */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-1 space-y-3 border-t border-hs-border-strong/60">
          {/* Screen selection — sortable included list + available list */}
          <div>
            <span className="text-xs text-hs-text-muted mb-1.5 block">
              {t('settings.profilesPage.card.screensHeading')}
            </span>

            {/* Included screens — draggable to reorder */}
            {includedScreens.length > 0 && (
              <DndContext sensors={screenSensors} collisionDetection={closestCenter} onDragEnd={handleScreenDragEnd}>
                <SortableContext items={validScreenIds} strategy={verticalListSortingStrategy}>
                  <div className="space-y-1 mb-2">
                    {includedScreens.map((screen) => (
                      <SortableScreenRow
                        key={screen.id}
                        screenId={screen.id}
                        screenName={screen.name}
                        screenEnabled={screen.enabled}
                        onRemove={() => removeScreen(screen.id)}
                        t={t}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}

            {/* Available screens — click to add */}
            {availableScreens.length > 0 && (
              <div className="space-y-1">
                {includedScreens.length > 0 && (
                  <span className="text-[10px] text-hs-text-faint uppercase tracking-wider">
                    {t('settings.profilesPage.card.availableHeading')}
                  </span>
                )}
                {availableScreens.map((screen) => (
                  <button
                    key={screen.id}
                    type="button"
                    onClick={() => addScreen(screen.id)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-hs-text-faint hover:bg-hs-card/60 hover:text-hs-text-secondary transition-colors"
                  >
                    <span className="text-xs">{t('settings.profilesPage.card.addScreenSymbol')}</span>
                    <span className="truncate">
                      {screen.name}
                      {screen.enabled === false && (
                        <span className="ml-1 text-[10px] text-hs-warning/70">
                          {t('settings.profilesPage.card.disabledLabel')}
                        </span>
                      )}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {includedScreens.length === 0 && (
              <p className="text-xs text-hs-warning mt-1">
                {t('settings.profilesPage.card.noScreensWarning')}
              </p>
            )}

            {includedScreens.length > 1 && (
              <p className="text-[10px] text-hs-text-faint mt-2">
                {t('settings.profilesPage.card.dragHelp')}
              </p>
            )}
          </div>

          {/* Schedule */}
          <div className="border-t border-hs-border-strong pt-3 space-y-3">
            <Toggle
              label={t('settings.profilesPage.card.scheduleToggleLabel')}
              checked={!!profile.schedule}
              onChange={toggleSchedule}
            />

            {profile.schedule && (
              <>
                <div>
                  <span className="text-xs text-hs-text-muted mb-1 block">
                    {t('settings.profilesPage.card.daysLabel')}
                  </span>
                  <div className="flex gap-1">
                    {dayLabels.map((label, i) => {
                      const days = profile.schedule?.daysOfWeek ?? [0, 1, 2, 3, 4, 5, 6];
                      const active = days.includes(i);
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() => toggleDay(i)}
                          className={`flex-1 text-[10px] py-1 rounded transition-colors ${
                            active
                              ? 'bg-hs-accent text-white'
                              : 'bg-hs-card text-hs-text-faint hover:bg-hs-hover'
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="text-xs text-hs-text-muted">
                      {t('settings.profilesPage.card.fromLabel')}
                    </span>
                    <input
                      type="time"
                      value={profile.schedule.startTime ?? ''}
                      onChange={(e) => setSchedule({ startTime: e.target.value || undefined })}
                      className={TIME_CLASS}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-hs-text-muted">
                      {t('settings.profilesPage.card.untilLabel')}
                    </span>
                    <input
                      type="time"
                      value={profile.schedule.endTime ?? ''}
                      onChange={(e) => setSchedule({ endTime: e.target.value || undefined })}
                      className={TIME_CLASS}
                    />
                  </label>
                </div>

                <Toggle
                  label={t('settings.profilesPage.card.invertLabel')}
                  checked={!!profile.schedule.invert}
                  onChange={(checked) => setSchedule({ invert: checked || undefined })}
                />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Main section ───────────────────────────── */

export default function ProfilesSection() {
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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Auto-save the slice of config this section can mutate. `config.profiles`
  // is the shared pool, `config.displays` covers per-display owned profiles
  // (the actual storage target in multi-display installs), and
  // `config.settings.activeProfile` is the global active field. Debounced
  // 500ms so rapid drag reorders or schedule-day toggles collapse into a
  // single PUT. Replaces the old explicit "Save Profiles" button.
  useDebouncedSave({
    values: [config?.profiles, config?.displays, config?.settings.activeProfile],
    debounceMs: 500,
    save: () => saveConfig(),
    onError: (err) => console.error('Profile auto-save failed:', err),
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
  const isDisplayOwnedProfiles = !!activeDisplay?.profiles;
  const profiles = activeDisplay
    ? getDisplayProfiles(activeDisplay, config.profiles)
    : config.profiles ?? [];
  const activeProfileId = isDisplayOwnedProfiles
    ? activeDisplay?.activeProfile
    : config.settings.activeProfile;

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
      <h3 className="text-sm font-medium text-hs-text-secondary mb-3 uppercase tracking-wider">
        {t('settings.profilesPage.heading')}
      </h3>
      <p className="text-xs text-hs-text-faint mb-4">
        {t('settings.profilesPage.description')}
      </p>

      {isMultiDisplay && (
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
        <label className="block mb-4">
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
