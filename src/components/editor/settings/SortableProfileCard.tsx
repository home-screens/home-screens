'use client';

import { useEffect, useState } from 'react';
import {
  DndContext,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, GripVertical, Pencil, Trash2, Check, X } from 'lucide-react';
import { useEditorStore } from '@/stores/editor-store';
import { getActiveScreens } from '@/lib/editor-multi-display';
import { getActiveProfileId } from '@/lib/display-filter';
import { useConfirmStore } from '@/stores/confirm-store';
import { dragEndIndices, useSortableSensors } from '@/hooks/useDndSensors';
import Toggle from '@/components/ui/Toggle';
import ScheduleWindowFields from '@/components/editor/ScheduleWindowFields';
import { useFormattingLocale, useTranslate, type TranslateFn } from '@/i18n';
import { describeSchedule } from '@/lib/schedule-summary';
import { EVERY_DAY } from '@/lib/schedule';
import { computeWeekSegments } from '@/lib/schedule-timeline';
import type { ModuleSchedule, Profile } from '@/types/config';
import { SETTINGS_INPUT_SM_CLASS } from '@/components/ui/input-classes';
import FieldHint from '@/components/ui/FieldHint';
import StatusPill from '@/components/ui/StatusPill';
import { buildDeleteConfirm } from '@/lib/delete-confirmations';

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
          <span className="ml-1 text-[10px] text-hs-warning-ink/70">
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

/** Starting points offered while naming a profile. */
const PROFILE_NAME_SUGGESTION_KEYS = ['morning', 'evening', 'weekend', 'guests'] as const;

interface ProfileCardProps {
  profile: Profile;
  index: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
  /** Open the name field as soon as this card mounts (a just-added profile). */
  startRenaming?: boolean;
  /** Called once `startRenaming` has been acted on, so it fires only once. */
  onRenameHandled?: () => void;
  t: TranslateFn;
}

export default function SortableProfileCard({
  profile,
  index,
  isExpanded,
  onToggleExpand,
  startRenaming,
  onRenameHandled,
  t,
}: ProfileCardProps) {
  const { config, selectedDisplayId, updateProfile, removeProfile } = useEditorStore();
  const formattingLocale = useFormattingLocale();
  const tCore = useTranslate('core');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // A freshly added profile opens straight into its name field with the
  // placeholder name selected, so naming it is the first thing that happens
  // rather than a second trip through the pencil icon.
  useEffect(() => {
    if (!startRenaming) return;
    setRenamingId(profile.id);
    setRenameValue('');
    onRenameHandled?.();
  }, [startRenaming, profile.id, onRenameHandled]);

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

  // Screen count plus, when the profile runs on a schedule, that schedule in
  // the same words the module scheduler uses.
  const screenCountLabel =
    includedScreens.length === 1
      ? t('settings.profilesPage.card.screenCountSingular', { count: includedScreens.length })
      : t('settings.profilesPage.card.screenCountPlural', { count: includedScreens.length });
  const summary = profile.schedule
    ? t('settings.profilesPage.card.summaryScheduled', {
        screens: screenCountLabel,
        when: describeSchedule(profile.schedule, t, formattingLocale, config.settings?.timeFormat).short,
      })
    : t('settings.profilesPage.card.summaryManual', { screens: screenCountLabel });

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
    const move = dragEndIndices(event, validScreenIds);
    if (move) updateProfile(profile.id, { screenIds: arrayMove(validScreenIds, move.from, move.to) });
  };

  const setSchedule = (updates: Partial<ModuleSchedule>) => {
    updateProfile(profile.id, { schedule: { ...profile.schedule, ...updates } });
  };

  const toggleSchedule = (enabled: boolean) => {
    if (enabled) {
      // Every day, all day, which the person then narrows. This used to
      // start on Monday to Friday, which quietly kept the profile off at
      // weekends for anyone who only wanted a time window.
      updateProfile(profile.id, { schedule: { daysOfWeek: [...EVERY_DAY] } });
    } else {
      updateProfile(profile.id, { schedule: undefined });
    }
  };

  // Hiding during the window with nothing narrowing the week leaves no time
  // at all. The switch stays usable so it can be undone; this only says so.
  const neverActive = !!profile.schedule && computeWeekSegments(profile.schedule).length === 0;

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
          <div className="flex flex-1 flex-col gap-1.5 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
            <input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
                if (e.key === 'Escape') setRenamingId(null);
              }}
              autoFocus
              className={`w-40 ${SETTINGS_INPUT_SM_CLASS}`}
            />
            <button type="button" onClick={commitRename} className="text-hs-success hover:text-hs-success/80">
              <Check className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={() => setRenamingId(null)} className="text-hs-text-faint hover:text-hs-text-secondary">
              <X className="w-3.5 h-3.5" />
            </button>
            </div>
            {/* One tap each. The suggestions teach what a profile is for far
                faster than the paragraph above the list does. */}
            <div className="flex flex-wrap gap-1.5">
              {PROFILE_NAME_SUGGESTION_KEYS.map((key) => {
                const suggestion = t(`settings.profilesPage.nameSuggestions.${key}`);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      updateProfile(profile.id, { name: suggestion });
                      setRenamingId(null);
                    }}
                    className="rounded border border-hs-border-strong bg-hs-card px-2 py-0.5 text-[11px] text-hs-text-muted hover:text-hs-text-body hover:border-hs-text-faint transition-colors"
                  >
                    {suggestion}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={onToggleExpand}
            className="flex flex-1 flex-col items-start gap-0.5 min-w-0 text-left"
          >
            <span className="flex items-center gap-2 min-w-0 max-w-full">
              <span className="text-sm font-medium text-hs-text-body truncate">{profile.name}</span>
              {activeProfileId === profile.id && (
                <StatusPill tone="info" size="sm">
                  {t('settings.profilesPage.card.activeBadge')}
                </StatusPill>
              )}
              {profile.schedule && (
                <StatusPill tone="success" size="sm">
                  {t('settings.profilesPage.card.scheduledBadge')}
                </StatusPill>
              )}
            </span>
            {/* "3 screens · Mon to Fri, 6:00 AM to 9:00 AM". Collapsed cards
                used to carry nothing but the name and a bare "#2", so working
                out what any profile actually did meant expanding all of them
                one at a time. */}
            <span className="text-[11px] text-hs-text-faint truncate max-w-full">
              {summary}
            </span>
          </button>
        )}

        <span className="text-[11px] text-hs-text-faint shrink-0">
          {t('settings.profilesPage.card.priorityBadge', { number: index + 1 })}
        </span>

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
            const ok = await useConfirmStore.getState().confirm(
              buildDeleteConfirm({ verb: 'delete', name: profile.name, consequence: tCore('confirm.cantUndo') }, tCore),
            );
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
                        <span className="ml-1 text-[10px] text-hs-warning-ink/70">
                          {t('settings.profilesPage.card.disabledLabel')}
                        </span>
                      )}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {includedScreens.length === 0 && (
              <p className="text-xs text-hs-warning-ink mt-1">
                {t('settings.profilesPage.card.noScreensWarning')}
              </p>
            )}

            {includedScreens.length > 1 && (
              <FieldHint className="mt-2">
                {t('settings.profilesPage.card.dragHelp')}
              </FieldHint>
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
                <ScheduleWindowFields
                  window={profile.schedule}
                  onPatch={setSchedule}
                  skin="settings"
                  labels={{
                    from: t('settings.profilesPage.card.fromLabel'),
                    until: t('settings.profilesPage.card.untilLabel'),
                  }}
                  testIds={{ shape: 'profile-schedule-shape', endDay: 'profile-schedule-end-day' }}
                />

                <Toggle
                  label={t('settings.profilesPage.card.invertLabel')}
                  checked={!!profile.schedule.invert}
                  onChange={(checked) => setSchedule({ invert: checked || undefined })}
                />
                {neverActive && (
                  <p data-testid="profile-schedule-never" className="-mt-1.5 text-[11px] text-hs-warning-ink">
                    {t('scheduleEditor.neverShows')}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
