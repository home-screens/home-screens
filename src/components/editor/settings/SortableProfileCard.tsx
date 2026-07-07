'use client';

import { useState } from 'react';
import {
  DndContext,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, GripVertical, Pencil, Trash2, Check, X } from 'lucide-react';
import { useEditorStore, getActiveScreens } from '@/stores/editor-store';
import { getActiveProfileId } from '@/lib/display-filter';
import { useConfirmStore } from '@/stores/confirm-store';
import { useSortableSensors } from '@/hooks/useDndSensors';
import Toggle from '@/components/ui/Toggle';
import type { TranslateFn } from '@/i18n';
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

export default function SortableProfileCard({ profile, index, isExpanded, onToggleExpand, t, dayLabels }: ProfileCardProps) {
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
  const screenSensors = useSortableSensors();

  if (!config) return null;

  // Profiles reference screens by ID, and screens are owned per-display
  // in multi-display mode (every DisplayNode has its own `screens` list).
  // So a profile defined for Kitchen references kitchen.screens, not the
  // legacy global pool. We follow the editor's `selectedDisplayId` so the
  // screen list and the profile's screen membership both reflect the
  // currently-active display. In single-display mode this resolves to
  // `config.screens` automatically.
  const screens = getActiveScreens(config, selectedDisplayId);
  const activeProfileId = getActiveProfileId(config, selectedDisplayId);

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
                    {t('fields.days')}
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
