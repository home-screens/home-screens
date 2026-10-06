import type { StoreApi } from 'zustand';
import type {
  ScreenConfiguration,
  ModuleType,
  ModuleInstance,
  ModuleStyle,
  ModulePosition,
  ModuleSize,
  GlobalSettings,
  Screen,
  Profile,
  DisplayNode,
  DisplayNodeSettings,
  DisplayRule,
} from '@/types/config';
import type { LayoutExport } from '@/types/layout-export';
import type { CoalesceKey, EditorSelection, HistoryEntry, PendingResave } from '@/stores/editor-save';

/**
 * The editor store's state and action surface, decomposed by concern. Each
 * `*Actions` interface is implemented by the matching slice factory in this
 * directory; `EditorState` is their composition plus the shared state
 * fields. Consumers never see the decomposition — they import
 * `useEditorStore` from `@/stores/editor-store` as before.
 */
export interface EditorCoreState extends EditorSelection {
  config: ScreenConfiguration | null;
  /**
   * `selectedDisplayId` (from `EditorSelection`): the display the editor is
   * currently operating on. When null, the editor is in legacy
   * single-display mode and all screen mutations go to `config.screens`.
   * When set to a display ID, mutations go to `displays[i].screens` and the
   * canvas uses that display's dimensions.
   */
  isDirty: boolean;
  isSaving: boolean;
  /**
   * Set while the saved setup could not be loaded at all (a damaged file, or
   * a hub that cannot read it), with whatever the hub said about it. The
   * editor and Settings show this in place of "Loading…", with a way to put
   * a backup back.
   */
  loadError: { detail: string | null } | null;
  saveError: string | null;
  /** Why the last save failed, so the toolbar can say something useful. */
  saveErrorKind: SaveErrorKind | null;
  /**
   * The config's revision as the hub last handed it to us (GET header, or the
   * PUT response). Sent back on every save so the hub can refuse to overwrite
   * a config that changed under us. Null until the first load.
   */
  configRevision: string | null;
  /**
   * The hub's own clock zone, from the config response
   * (`HUB_TIMEZONE_HEADER`). With no zone saved it is the household's zone on
   * every surface, so the editor's previews, badges and clocks use it rather
   * than this laptop's. Null until the first load, or when the hub did not
   * name one.
   */
  hubTimezone: string | null;
  /**
   * Set when a save was refused because the config changed somewhere else
   * (another editor, a phone, a remote profile switch). Auto-save stays off
   * until the user picks a side via `resolveSaveConflict`.
   */
  saveConflict: SaveConflict | null;
  /**
   * Set by `discardDraft`: the config in memory is one the editor could not
   * draw, and it must not reach the hub while the page is being reloaded.
   * Every save and the leave-page prompt stand down until a load replaces
   * the draft.
   */
  saveHeld: boolean;
  /**
   * Bumped whenever the whole config is replaced from outside the editing
   * session (load, restore/import, "load their changes"), as opposed to
   * mutated by an edit. Forms that hold their own copy of settings re-hydrate
   * on it; an ordinary save or profile switch must not wipe their edits.
   */
  configGeneration: number;
  /** Internal: deferred promise representing a queued re-save. When
   * `saveConfig()` is called while a previous save is still in flight,
   * the caller awaits this so its `await saveConfig()` resolves only
   * after the run that includes its mutation has actually landed on
   * disk — preserving the contract that 15+ call sites already rely on
   * (closing modals, painting "Saved", etc.). The in-flight save flushes
   * this in its `finally` block by recursively calling `saveConfig`
   * and tying the recursive call's outcome back to `resolve`/`reject`. */
  _pendingResave: PendingResave | null;
  snapEnabled: boolean;
  _past: HistoryEntry[];
  _future: HistoryEntry[];
  _lastHistoryTime: number;
  _lastHistoryActionKey: string;
}

export type SaveErrorKind = 'validation' | 'network' | 'server' | 'conflict';

export interface SaveConflict {
  /** The config as it is on the hub now. */
  theirs: ScreenConfiguration;
  /** Its revision, so "keep mine" can overwrite exactly that version. */
  revision: string;
}

export interface ConfigActions {
  loadConfig: () => Promise<void>;
  saveConfig: () => Promise<void>;
  /**
   * Settle a `saveConflict`. 'theirs' replaces the in-memory config with the
   * hub's (the local version goes on the undo stack); 'mine' re-saves over
   * the hub's version.
   */
  resolveSaveConflict: (choice: 'theirs' | 'mine') => Promise<void>;
  /**
   * Give up the unsaved draft because the editor crashed drawing it: hold
   * every save, drop the dirty flag and load the hub's copy, which lifts the
   * hold. The route error screen reloads the page too, but browser Back can
   * bring the editor back before that with the store it had; the load is
   * what makes that editor save again.
   */
  discardDraft: () => Promise<void>;
  /** `revision` is the hub's revision of exactly this config (a restore's
   *  read-back), so the next save is not refused as a conflict. */
  importConfig: (json: string, revision?: string | null) => void;
  /**
   * Bring the editor along after the hub rewrote config.json on its own (a
   * plugin uninstalled, a custom icon removed, library files moved or a
   * folder renamed, a plugin's config migrated). See `HubRewrite`.
   */
  adoptHubRewrite: (change: HubRewrite) => Promise<void>;
}

/** A change the hub made to config.json by itself, for `adoptHubRewrite`. */
export interface HubRewrite {
  /** The same pure change, for the editor's own copy. Must not mutate its input. */
  rewrite: (config: ScreenConfiguration) => ScreenConfiguration;
  /** The revision of the config the hub applied it to; null when unknown. */
  previousRevision: string | null;
  /** The revision it left. */
  revision: string;
}

export interface SelectionActions {
  setSelectedDisplay: (id: string | null) => void;
  selectScreen: (id: string) => void;
  selectModule: (id: string | null) => void;
  toggleSnap: () => void;
}

export interface ModuleActions {
  addModule: (screenId: string, type: ModuleType, position?: ModulePosition) => void;
  removeModule: (screenId: string, moduleId: string) => void;
  /** Clone a module onto the same screen, one grid step down-right, selected. */
  duplicateModule: (screenId: string, moduleId: string) => void;
  updateModule: (screenId: string, moduleId: string, updates: Partial<ModuleInstance>) => void;
  updateModuleStyle: (screenId: string, moduleId: string, style: Partial<ModuleStyle>) => void;
  moveModule: (
    screenId: string,
    moduleId: string,
    position: ModulePosition,
    opts?: {
      /** Drag drops set this so a module dropped onto another is raised above
       *  it instead of vanishing underneath; typed X/Y edits and arrow nudges
       *  leave deliberate layering alone. */
      raiseOnOverlap?: boolean;
    },
  ) => void;
  resizeModule: (screenId: string, moduleId: string, size: ModuleSize) => void;
  /** Move a module to the front or back of its screen's stacking order. */
  reorderModule: (screenId: string, moduleId: string, to: 'front' | 'back') => void;
  /**
   * Scale every module on one display's screens from the old canvas to the
   * new one. `displayId` null scales the single-display screens.
   */
  scaleAllModules: (
    displayId: string | null,
    oldWidth: number,
    oldHeight: number,
    newWidth: number,
    newHeight: number,
  ) => void;
}

export interface ScreenActions {
  /** `name` is the new screen's name in the household's language ("Screen 4"). */
  addScreen: (name?: string) => void;
  removeScreen: (id: string) => void;
  /** Clone a screen (fresh screen + module ids, "<name> copy") right after the original, selected. */
  /** `copyName` is the copy's name in the household's language ("Home copy"). */
  duplicateScreen: (id: string, copyName?: string) => void;
  /** Clone every screen of another display onto the active one, with new ids. */
  copyScreensFromDisplay: (sourceDisplayId: string) => void;
  reorderScreens: (fromIndex: number, toIndex: number) => void;
  updateScreen: (id: string, updates: Partial<Screen>) => void;
}

export interface SettingsActions {
  updateSettings: (settings: Partial<GlobalSettings>) => void;
  updateDisplaySettings: (displayId: string, partial: Partial<DisplayNodeSettings>) => void;
}

export interface ProfileActions {
  addProfile: (name: string) => void;
  removeProfile: (id: string) => void;
  updateProfile: (id: string, updates: Partial<Profile>) => void;
  reorderProfiles: (fromIndex: number, toIndex: number) => void;
  setActiveProfile: (id: string | undefined) => void;
}

export interface RuleActions {
  addRule: (name: string) => void;
  removeRule: (id: string) => void;
  updateRule: (id: string, updates: Partial<DisplayRule>) => void;
  reorderRules: (fromIndex: number, toIndex: number) => void;
  /** Copy a rule from the active display to another display, with a fresh id
   *  and (for showScreen actions) a blanked screen target. Multi-display only. */
  copyRuleToDisplay: (ruleId: string, targetDisplayId: string) => void;
}

export interface DisplayActions {
  /**
   * `mainName` names the main display this creates when the first display
   * added is another one, in the household's language.
   */
  addDisplay: (display: Omit<DisplayNode, 'screens'> & { screens?: Screen[] }, mainName?: string) => void;
  updateDisplay: (id: string, updates: Partial<DisplayNode>) => void;
  removeDisplay: (id: string) => void;
}

export interface LayoutActions {
  exportLayout: (options?: { screenIds?: string[]; name?: string; description?: string }) => void;
  importLayoutAction: (layout: LayoutExport, options: {
    mode: 'add' | 'replace';
    applyVisual?: boolean;
    /**
     * Add mode only: a screen that is empty when the import lands is dropped
     * in the same mutation, so "start this empty screen from a template"
     * does not leave the blank screen behind in the rotation.
     */
    replaceEmptyScreenId?: string;
    /** See `ImportOptions.importedName`. */
    importedName?: (name: string, number?: number) => string;
  }) => void;
}

export interface HistoryActions {
  undo: () => void;
  redo: () => void;
}

export type EditorState = EditorCoreState &
  ConfigActions &
  SelectionActions &
  ModuleActions &
  ScreenActions &
  SettingsActions &
  ProfileActions &
  RuleActions &
  DisplayActions &
  LayoutActions &
  HistoryActions;

export type EditorSet = StoreApi<EditorState>['setState'];
export type EditorGet = StoreApi<EditorState>['getState'];

/**
 * Apply a config mutation with history bookkeeping. Built once in
 * `editor-store.ts` on top of the pure `applyMutation` in `editor-save.ts`
 * and handed to every slice factory. `fn` receives the current (non-null)
 * config and returns the state partial to dispatch; `options.coalesce`
 * takes a key minted by `COALESCE_KEYS` (the branded type rejects raw
 * strings) to collapse rapid same-key mutations into one undo entry.
 */
export type MutateConfig = (
  fn: (config: ScreenConfiguration) => Partial<EditorState>,
  options?: { coalesce?: CoalesceKey },
) => void;
