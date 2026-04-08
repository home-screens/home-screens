'use client';

import { useState } from 'react';
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
import type { ModuleSchedule, Profile } from '@/types/config';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const TIME_CLASS =
  'mt-1 block w-full rounded-md bg-neutral-800 border border-neutral-600 text-sm text-neutral-200 px-3 py-2 focus:outline-none focus:border-blue-500';

/* ─── Sortable screen row (inside profile) ──── */

interface SortableScreenRowProps {
  screenId: string;
  screenName: string;
  screenEnabled?: boolean;
  onRemove: () => void;
}

function SortableScreenRow({ screenId, screenName, screenEnabled, onRemove }: SortableScreenRowProps) {
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
      className="flex items-center gap-2 rounded-md bg-neutral-800/60 px-2 py-1.5"
    >
      <button
        type="button"
        className="cursor-grab touch-none text-neutral-600 hover:text-neutral-400 transition-colors"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-3.5 h-3.5" />
      </button>
      <span className="flex-1 text-sm text-neutral-300 truncate">
        {screenName}
        {screenEnabled === false && <span className="ml-1 text-[10px] text-amber-500/70">(disabled)</span>}
      </span>
      <button
        type="button"
        onClick={onRemove}
        className="text-neutral-600 hover:text-red-400 transition-colors"
        title="Remove from profile"
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
}

function SortableProfileCard({ profile, index, isExpanded, onToggleExpand }: ProfileCardProps) {
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

  // Profiles reference the screens of whichever display the editor is
  // currently working on. In legacy single-display mode this resolves to
  // the global screen pool.
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
      className="rounded-lg border border-neutral-700 bg-neutral-800/50 overflow-hidden"
    >
      {/* Collapsed header — always visible */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          className="cursor-grab touch-none text-neutral-600 hover:text-neutral-400 transition-colors"
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
            className={`w-4 h-4 text-neutral-500 transition-transform ${isExpanded ? '' : '-rotate-90'}`}
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
              className="w-40 rounded border border-neutral-600 bg-neutral-900 px-2 py-0.5 text-sm text-neutral-200 outline-none focus:border-blue-500"
            />
            <button type="button" onClick={commitRename} className="text-green-400 hover:text-green-300">
              <Check className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={() => setRenamingId(null)} className="text-neutral-500 hover:text-neutral-300">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onToggleExpand}
            className="flex flex-1 items-center gap-2 min-w-0"
          >
            <span className="text-sm font-medium text-neutral-200 truncate">{profile.name}</span>
            {activeProfileId === profile.id && (
              <span className="text-[10px] uppercase tracking-wider text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded shrink-0">Active</span>
            )}
            {profile.schedule && (
              <span className="text-[10px] uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded shrink-0">Scheduled</span>
            )}
          </button>
        )}

        <span className="text-[11px] text-neutral-600 tabular-nums shrink-0">#{index + 1}</span>

        <button
          onClick={(e) => {
            e.stopPropagation();
            setRenamingId(profile.id);
            setRenameValue(profile.name);
          }}
          className="text-neutral-600 hover:text-neutral-300 transition-colors shrink-0"
          title="Rename"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={async (e) => {
            e.stopPropagation();
            if (await useConfirmStore.getState().confirm(`Delete "${profile.name}"?`)) {
              removeProfile(profile.id);
            }
          }}
          className="text-neutral-600 hover:text-red-400 transition-colors shrink-0"
          title="Delete profile"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Expanded body */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-1 space-y-3 border-t border-neutral-700/60">
          {/* Screen selection — sortable included list + available list */}
          <div>
            <span className="text-xs text-neutral-400 mb-1.5 block">Screens</span>

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
                  <span className="text-[10px] text-neutral-500 uppercase tracking-wider">Available</span>
                )}
                {availableScreens.map((screen) => (
                  <button
                    key={screen.id}
                    type="button"
                    onClick={() => addScreen(screen.id)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-neutral-500 hover:bg-neutral-800/60 hover:text-neutral-300 transition-colors"
                  >
                    <span className="text-xs">+</span>
                    <span className="truncate">
                      {screen.name}
                      {screen.enabled === false && <span className="ml-1 text-[10px] text-amber-500/70">(disabled)</span>}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {includedScreens.length === 0 && (
              <p className="text-xs text-amber-400 mt-1">
                No screens selected — all screens will be shown as fallback.
              </p>
            )}

            {includedScreens.length > 1 && (
              <p className="text-[10px] text-neutral-500 mt-2">
                Drag to set rotation order within this profile.
              </p>
            )}
          </div>

          {/* Schedule */}
          <div className="border-t border-neutral-700 pt-3 space-y-3">
            <Toggle
              label="Auto-activate on schedule"
              checked={!!profile.schedule}
              onChange={toggleSchedule}
            />

            {profile.schedule && (
              <>
                <div>
                  <span className="text-xs text-neutral-400 mb-1 block">Days</span>
                  <div className="flex gap-1">
                    {DAYS.map((label, i) => {
                      const days = profile.schedule?.daysOfWeek ?? [0, 1, 2, 3, 4, 5, 6];
                      const active = days.includes(i);
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() => toggleDay(i)}
                          className={`flex-1 text-[10px] py-1 rounded transition-colors ${
                            active
                              ? 'bg-blue-600 text-white'
                              : 'bg-neutral-800 text-neutral-500 hover:bg-neutral-700'
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
                    <span className="text-xs text-neutral-400">From</span>
                    <input
                      type="time"
                      value={profile.schedule.startTime ?? ''}
                      onChange={(e) => setSchedule({ startTime: e.target.value || undefined })}
                      className={TIME_CLASS}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-neutral-400">Until</span>
                    <input
                      type="time"
                      value={profile.schedule.endTime ?? ''}
                      onChange={(e) => setSchedule({ endTime: e.target.value || undefined })}
                      className={TIME_CLASS}
                    />
                  </label>
                </div>

                <Toggle
                  label="Invert (hide during this window instead)"
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
  const { config, selectedDisplayId, addProfile, reorderProfiles, setActiveProfile, saveConfig } = useEditorStore();
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (!config) return null;

  // In multi-display mode, profile list + active-profile selection follow
  // the currently-selected display — every display owns its own profile
  // list (addDisplay bootstrap migrates `config.profiles` onto Main and
  // gives every subsequent display an empty owned list). Legacy configs
  // loaded from disk may still have a display with `!display.profiles`
  // that transparently reads through to `config.profiles`; the fall-
  // through below keeps those rendering correctly until the user edits
  // something that forces a resave.
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
    addProfile(`Profile ${profiles.length + 1}`);
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

  return (
    <section>
      <h3 className="text-sm font-medium text-neutral-300 mb-3 uppercase tracking-wider">
        Profiles
      </h3>
      <p className="text-xs text-neutral-500 mb-4">
        Profiles control which screens are shown on the display and in what order. Create different layouts for morning, evening, weekends, etc.
        When no profile is active, all screens rotate in the default tab order.
      </p>

      {/* Active profile selector */}
      {profiles.length > 0 && (
        <label className="block mb-4">
          <span className="text-xs text-neutral-400">Active Profile</span>
          <select
            value={activeProfileId ?? ''}
            onChange={(e) => setActiveProfile(e.target.value || undefined)}
            className="block w-full rounded-md bg-neutral-800 border border-neutral-600 text-sm text-neutral-200 px-3 py-2 focus:outline-none focus:border-blue-500 mt-1"
          >
            <option value="">None (show all screens)</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <p className="text-xs text-neutral-500 mt-1">
            Manually set which profile is active. Scheduled profiles take priority over this setting.
          </p>
        </label>
      )}

      {/* Priority note */}
      {profiles.length > 1 && (
        <div className="rounded-md bg-neutral-800/60 border border-neutral-700/50 px-3 py-2 mb-4">
          <p className="text-xs text-neutral-400">
            <span className="font-medium text-neutral-300">Priority order:</span>{' '}
            When multiple profiles have overlapping schedules, the profile listed first wins. Drag to reorder.
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
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <div className="flex items-center gap-3 mt-4">
        <Button variant="secondary" onClick={handleAdd}>
          Add Profile
        </Button>
        <Button
          variant="primary"
          onClick={async () => {
            setSaving(true);
            setSaveMessage(null);
            try {
              await saveConfig();
              setSaveMessage('Saved');
              setTimeout(() => setSaveMessage(null), 2000);
            } catch {
              setSaveMessage('Save failed');
            } finally {
              setSaving(false);
            }
          }}
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save Profiles'}
        </Button>
        {saveMessage && (
          <span className={`text-xs ${saveMessage === 'Saved' ? 'text-green-400' : 'text-red-400'}`}>
            {saveMessage}
          </span>
        )}
      </div>
    </section>
  );
}
