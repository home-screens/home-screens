/**
 * The rules behind Settings > Screen > Touch: one press that turns every
 * touch switch on, or every one off.
 *
 * It is a press, not a rule on top. All on and All off write the real
 * switches (the three on the Screen and Calendar pages, and each card's own),
 * so every card keeps showing the truth, and whatever is changed on one card
 * afterwards simply stays that way. "On", "Off" and "Some on" are worked out
 * from the switches themselves and are never saved.
 *
 * The one thing that is saved is the last press, so a card added after All
 * off starts with touch off too (`newCardsTouchOff`).
 *
 * Left alone on purpose: open buttons (turning one off would mean forgetting
 * which screen it opens), the screen dots (they also show which screen is up),
 * and everything on the wall that has no switch.
 */

import type { DisplayNode, GlobalSettings, ModuleInstance, ScreenConfiguration } from '@/types/config';
import { forEachConfigModule, rewriteConfigModules } from '@/lib/config-modules';
import { DISPLAY_FIELD_FALLBACKS } from '@/lib/display-override-fields';
import { displayShowsPaginationDots } from '@/lib/pagination-dots';
import { getModuleDefinition } from '@/lib/module-registry';

/** The groups the All on / All off question lists its counts under. */
export const TOUCH_AREAS = ['screens', 'tap', 'notes', 'calendar', 'meals', 'news'] as const;
export type TouchArea = (typeof TOUCH_AREAS)[number];

/** Every display, or the one display whose page the press was made on. */
export interface TouchScope {
  displayId?: string;
}

type SettingField = 'swipeEnabled' | 'pauseEnabled' | 'calendarWallEntry';

/** One touch switch as it stands now, wherever it lives. */
export interface TouchSwitch {
  /** Unique within one listing. */
  key: string;
  area: TouchArea;
  /** The switch's own label in the `editor` dictionary, the same words its page uses. */
  labelKey: string;
  on: boolean;
  /** The display it belongs to; absent with a single display. */
  displayId?: string;
  displayName?: string;
  /** Set for a card's switch. */
  module?: { id: string; type: ModuleInstance['type']; screenName: string };
}

/** One saved value a press changes, with what it was, so Undo can put it back. */
export type TouchChange =
  | { kind: 'module'; displayId?: string; moduleId: string; field: string; from: unknown; to: unknown }
  | { kind: 'setting'; displayId?: string; field: SettingField; from: boolean | undefined; to: boolean | undefined }
  | { kind: 'remember'; displayId?: string; from: boolean | undefined; to: boolean | undefined };

interface ModuleSwitchRule {
  field: string;
  area: TouchArea;
  labelKey: string;
  isOn: (value: unknown) => boolean;
  /** What All on writes into a switch that is off. */
  onValue: (type: ModuleInstance['type']) => unknown;
  offValue: unknown;
}

/** A plain switch. `absentOn` says what the wall does with a card saved before the switch existed. */
function toggle(field: string, area: TouchArea, labelKey: string, absentOn = false): ModuleSwitchRule {
  return {
    field,
    area,
    labelKey,
    isOn: (value) => (value === undefined ? absentOn : value === true),
    onValue: () => true,
    offValue: false,
  };
}

/**
 * A setting that is a choice with a "nothing" among its options. All off sets
 * the nothing; All on only fills in a choice that is at nothing, with what a
 * new card gets, and never replaces one somebody picked.
 */
function choice(field: string, area: TouchArea, labelKey: string, nothing: string, absent: string, fill: string): ModuleSwitchRule {
  return {
    field,
    area,
    labelKey,
    isOn: (value) => (typeof value === 'string' ? value : absent) !== nothing,
    onValue: () => fill,
    offValue: nothing,
  };
}

/** The view buttons under a calendar's heading: on while any view is picked. */
const wallViews: ModuleSwitchRule = {
  field: 'wallViews',
  area: 'calendar',
  labelKey: 'configSections.calendarGroups.wallViews',
  isOn: (value) => Array.isArray(value) && value.length > 0,
  onValue: (type) => {
    const fresh = getModuleDefinition(type)?.defaultConfig.wallViews;
    return Array.isArray(fresh) ? [...fresh] : [];
  },
  offValue: [],
};

const TAP_ON_WALL = 'configSections.tapOnWall';
const ADD_EVENTS = toggle('addEvents', 'calendar', 'configSections.calendarGroups.addEvents', true);
const SHOW_ONE_PERSON = toggle('showOnePerson', 'calendar', 'configSections.calendarPeople.showOnePerson');
const WALL_ADD_MEALS = toggle('wallAdd', 'meals', 'configSections.meal-planner.wallAdd');
const WALL_PLAN = toggle('wallPlan', 'meals', 'configSections.meal-planner.wallPlan');
const NEWS_TAP = choice('tapAction', 'news', 'configSections.news.tapAction', 'none', 'qr', 'qr');

/**
 * Every card setting that decides whether the wall answers a finger, by card
 * type. A new touch switch on a card is added here, or All off leaves it on.
 */
export const MODULE_TOUCH_SWITCHES: Partial<Record<ModuleInstance['type'], readonly ModuleSwitchRule[]>> = {
  calendar: [toggle('eventTapDetails', 'calendar', 'configSections.calendar.eventTapDetails'), ADD_EVENTS, wallViews, SHOW_ONE_PERSON],
  'fullscreen-calendar': [
    toggle('eventTapDetails', 'calendar', 'configSections.fullscreen-calendar.eventTapDetails'),
    ADD_EVENTS,
    wallViews,
    SHOW_ONE_PERSON,
  ],
  'multi-month': [toggle('eventTapDetails', 'calendar', 'configSections.multi-month.eventTapDetails'), ADD_EVENTS],
  todo: [toggle('interactive', 'tap', TAP_ON_WALL), toggle('wallAdd', 'tap', 'configSections.todo.wallAdd')],
  todoist: [toggle('allowComplete', 'tap', TAP_ON_WALL)],
  notes: [toggle('wallDraw', 'notes', 'configSections.notes.wallDraw'), toggle('wallWrite', 'notes', 'configSections.notes.wallWrite')],
  news: [NEWS_TAP],
  'fullscreen-news': [NEWS_TAP],
  'photo-slideshow': [toggle('interactive', 'tap', TAP_ON_WALL, true)],
  'fullscreen-photo': [toggle('interactive', 'tap', TAP_ON_WALL, true)],
  'meal-planner': [
    toggle('interactive', 'meals', TAP_ON_WALL, true),
    choice('tapRecipeAction', 'meals', 'configSections.meal-planner.tapRecipeAction', 'off', 'off', 'card'),
    WALL_ADD_MEALS,
    WALL_PLAN,
  ],
  'fullscreen-meal-planner': [
    toggle('interactive', 'meals', TAP_ON_WALL, true),
    choice('tapRecipeAction', 'meals', 'configSections.fullscreen-meal-planner.tapRecipeAction', 'off', 'off', 'card'),
    WALL_ADD_MEALS,
    WALL_PLAN,
  ],
  'chore-chart': [toggle('allowDisplayComplete', 'tap', TAP_ON_WALL, true)],
  'fullscreen-chore-chart': [toggle('allowDisplayComplete', 'tap', TAP_ON_WALL, true)],
};

const SETTING_LABELS: Record<SettingField, string> = {
  swipeEnabled: 'settings.defaultDisplayPage.fields.swipeEnabledLabel',
  pauseEnabled: 'settings.defaultDisplayPage.fields.pauseEnabledLabel',
  calendarWallEntry: 'settings.calendarPage.adding.wallSwitch',
};

const SETTING_AREAS: Record<SettingField, TouchArea> = {
  swipeEnabled: 'screens',
  pauseEnabled: 'screens',
  calendarWallEntry: 'calendar',
};

function sharedValue(settings: GlobalSettings, field: SettingField): boolean {
  if (field === 'calendarWallEntry') return settings.calendarWallEntry !== false;
  return settings[field] ?? DISPLAY_FIELD_FALLBACKS[field];
}

function effectiveValue(settings: GlobalSettings, display: DisplayNode | undefined, field: SettingField): boolean {
  return display?.settings?.[field] ?? sharedValue(settings, field);
}

/**
 * The Screen and Calendar page switches that mean something for `display`
 * right now: pausing lives on the dots, and the wall adds events only once
 * the household has adding turned on. A switch its page is not showing is
 * not counted and not changed.
 */
function settingFields(settings: GlobalSettings, display: DisplayNode | undefined): SettingField[] {
  const fields: SettingField[] = ['swipeEnabled'];
  if (displayShowsPaginationDots(settings, display)) fields.push('pauseEnabled');
  if (settings.calendar?.eventEntry?.enabled) fields.push('calendarWallEntry');
  return fields;
}

function liveDisplays(config: ScreenConfiguration): DisplayNode[] {
  return Array.isArray(config.displays) ? config.displays : [];
}

/** The displays a press covers; one `undefined` stands for a household with a single display. */
function scopedDisplays(config: ScreenConfiguration, scope: TouchScope): (DisplayNode | undefined)[] {
  const displays = liveDisplays(config);
  if (displays.length === 0) return [undefined];
  return scope.displayId ? displays.filter((d) => d.id === scope.displayId) : displays;
}

function eachScopedModule(
  config: ScreenConfiguration,
  scope: TouchScope,
  visit: (mod: ModuleInstance, display: DisplayNode | undefined, screenName: string) => void,
): void {
  const screenNames = new Map<ModuleInstance, string>();
  const note = (screens: ScreenConfiguration['screens'] | undefined) => {
    for (const screen of Array.isArray(screens) ? screens : []) {
      for (const mod of Array.isArray(screen?.modules) ? screen.modules : []) screenNames.set(mod, screen.name);
    }
  };
  note(config.screens);
  for (const display of liveDisplays(config)) note(display.screens);
  forEachConfigModule(config, (mod, site) => {
    if (!site.live) return;
    if (scope.displayId && site.display?.id !== scope.displayId) return;
    visit(mod, site.display, screenNames.get(mod) ?? '');
  });
}

/** Every touch switch in scope, as it stands. */
export function listTouchSwitches(config: ScreenConfiguration, scope: TouchScope = {}): TouchSwitch[] {
  const out: TouchSwitch[] = [];
  for (const display of scopedDisplays(config, scope)) {
    for (const field of settingFields(config.settings, display)) {
      out.push({
        key: `setting:${display?.id ?? ''}:${field}`,
        area: SETTING_AREAS[field],
        labelKey: SETTING_LABELS[field],
        on: effectiveValue(config.settings, display, field),
        displayId: display?.id,
        displayName: display?.name,
      });
    }
  }
  eachScopedModule(config, scope, (mod, display, screenName) => {
    for (const rule of MODULE_TOUCH_SWITCHES[mod.type] ?? []) {
      out.push({
        key: `module:${display?.id ?? ''}:${mod.id}:${rule.field}`,
        area: rule.area,
        labelKey: rule.labelKey,
        on: rule.isOn(mod.config?.[rule.field]),
        displayId: display?.id,
        displayName: display?.name,
        module: { id: mod.id, type: mod.type, screenName },
      });
    }
  });
  return out;
}

export type TouchState = 'on' | 'off' | 'some' | 'none';

/** What the Touch box says: all on, all off, a mix, or nothing to switch. */
export function touchState(switches: readonly TouchSwitch[]): TouchState {
  if (switches.length === 0) return 'none';
  const on = switches.filter((s) => s.on).length;
  return on === switches.length ? 'on' : on === 0 ? 'off' : 'some';
}

/** Whether a card added to `displayId` (or to the only display) starts with touch off. */
export function newCardsStartTouchOff(config: ScreenConfiguration, displayId?: string | null): boolean {
  const display = displayId ? liveDisplays(config).find((d) => d.id === displayId) : undefined;
  return display?.newCardsTouchOff ?? config.settings.newCardsTouchOff ?? false;
}

/** A new card's settings with every touch switch off. */
export function withTouchOff(type: ModuleInstance['type'], moduleConfig: Record<string, unknown>): Record<string, unknown> {
  const rules = MODULE_TOUCH_SWITCHES[type];
  if (!rules) return moduleConfig;
  const next = { ...moduleConfig };
  for (const rule of rules) next[rule.field] = rule.offValue;
  return next;
}

/** Every saved value that All on (`on`) or All off has to change in scope. Empty when it is already so. */
export function planTouchAll(config: ScreenConfiguration, scope: TouchScope, on: boolean): TouchChange[] {
  const changes: TouchChange[] = [];
  const { settings } = config;
  const displays = liveDisplays(config);
  const wholeHouse = !scope.displayId || displays.length === 0;
  // What a display reads once this press's shared values are in.
  const sharedAfter = new Map<SettingField, boolean>();

  if (wholeHouse) {
    // The shared value is the one every display follows, so it is set and the
    // displays' own values for it are dropped.
    const fields = new Set<SettingField>();
    for (const display of displays.length ? displays : [undefined]) {
      for (const field of settingFields(settings, display)) fields.add(field);
    }
    for (const field of fields) {
      // Adding on the wall is saved only while it is off.
      const to = field === 'calendarWallEntry' ? (on ? undefined : false) : on;
      if (settings[field] !== to && sharedValue(settings, field) !== on) {
        changes.push({ kind: 'setting', field, from: settings[field], to });
      }
      sharedAfter.set(field, on);
      for (const display of displays) {
        const own = display.settings?.[field];
        if (own !== undefined) changes.push({ kind: 'setting', displayId: display.id, field, from: own, to: undefined });
      }
    }
    const remember = on ? undefined : true;
    if (settings.newCardsTouchOff !== remember) {
      changes.push({ kind: 'remember', from: settings.newCardsTouchOff, to: remember });
    }
    for (const display of displays) {
      if (display.newCardsTouchOff !== undefined) {
        changes.push({ kind: 'remember', displayId: display.id, from: display.newCardsTouchOff, to: undefined });
      }
    }
  } else {
    const display = displays.find((d) => d.id === scope.displayId);
    if (!display) return [];
    for (const field of settingFields(settings, display)) {
      const own = display.settings?.[field];
      // Follow the shared value where it already says the same.
      const to = sharedValue(settings, field) === on ? undefined : on;
      if (own !== to) changes.push({ kind: 'setting', displayId: display.id, field, from: own, to });
    }
    const sharedOff = settings.newCardsTouchOff ?? false;
    const remember = sharedOff === !on ? undefined : !on;
    if (display.newCardsTouchOff !== remember) {
      changes.push({ kind: 'remember', displayId: display.id, from: display.newCardsTouchOff, to: remember });
    }
  }

  eachScopedModule(config, scope, (mod, display) => {
    for (const rule of MODULE_TOUCH_SWITCHES[mod.type] ?? []) {
      const from = mod.config?.[rule.field];
      if (rule.isOn(from) === on) continue;
      changes.push({
        kind: 'module',
        displayId: display?.id,
        moduleId: mod.id,
        field: rule.field,
        from,
        to: on ? rule.onValue(mod.type) : rule.offValue,
      });
    }
  });
  return changes;
}

function setOrDrop<T extends object>(target: T, key: string, value: unknown): T {
  const next = { ...target } as Record<string, unknown>;
  if (value === undefined) delete next[key];
  else next[key] = value;
  return next as T;
}

/**
 * The config with `changes` made, or, with `back`, taken out again. Undo puts
 * back exactly the values a press changed and nothing else, so an edit made
 * elsewhere in between is kept.
 */
export function applyTouchChanges(config: ScreenConfiguration, changes: readonly TouchChange[], direction: 'forward' | 'back' = 'forward'): ScreenConfiguration {
  if (changes.length === 0) return config;
  const valueOf = (change: TouchChange) => (direction === 'forward' ? change.to : change.from);

  let settings = config.settings;
  const displayEdits = new Map<string, (display: DisplayNode) => DisplayNode>();
  const editDisplay = (id: string, edit: (display: DisplayNode) => DisplayNode) => {
    const before = displayEdits.get(id);
    displayEdits.set(id, before ? (d) => edit(before(d)) : edit);
  };
  const moduleEdits = new Map<string, Record<string, unknown>>();

  for (const change of changes) {
    const value = valueOf(change);
    if (change.kind === 'module') {
      const at = `${change.displayId ?? ''}:${change.moduleId}`;
      moduleEdits.set(at, { ...moduleEdits.get(at), [change.field]: value });
    } else if (change.kind === 'setting') {
      if (!change.displayId) settings = setOrDrop(settings, change.field, value);
      else {
        editDisplay(change.displayId, (display) => {
          const own = setOrDrop(display.settings ?? {}, change.field, value);
          if (Object.keys(own).length > 0) return { ...display, settings: own };
          const { settings: _none, ...rest } = display;
          void _none;
          return rest;
        });
      }
    } else if (!change.displayId) settings = setOrDrop(settings, 'newCardsTouchOff', value);
    else editDisplay(change.displayId, (display) => setOrDrop(display, 'newCardsTouchOff', value));
  }

  let next: ScreenConfiguration = settings === config.settings ? config : { ...config, settings };
  if (displayEdits.size > 0 && Array.isArray(next.displays)) {
    next = { ...next, displays: next.displays.map((display) => displayEdits.get(display.id)?.(display) ?? display) };
  }
  if (moduleEdits.size > 0) {
    next = rewriteConfigModules(next, (mod, site) => {
      if (!site.live) return mod;
      const edit = moduleEdits.get(`${site.display?.id ?? ''}:${mod.id}`);
      if (!edit) return mod;
      let moduleConfig = mod.config ?? {};
      for (const [field, value] of Object.entries(edit)) moduleConfig = setOrDrop(moduleConfig, field, value);
      return { ...mod, config: moduleConfig };
    });
  }
  return next;
}

/** How many switches in each area a press would flip, and how many there are, for the question's list. */
export function touchAreaCounts(switches: readonly TouchSwitch[], on: boolean): { area: TouchArea; total: number; changing: number }[] {
  return TOUCH_AREAS.map((area) => {
    const inArea = switches.filter((s) => s.area === area);
    return { area, total: inArea.length, changing: inArea.filter((s) => s.on !== on).length };
  }).filter((row) => row.total > 0);
}
