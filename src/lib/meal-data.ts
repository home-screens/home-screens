import { promises as fs } from 'fs';
import type { SavedMeal, PlannedMeal, MealSettings, MealSlotType } from '@/types/config';
import { createJsonStore } from './json-store';
import { readConfig } from './config';
import { toISODate, DEFAULT_MEAL_SETTINGS, normalizeMealSettings } from './meal-constants';

// ── Data shape ────────────────────────────────

export interface MealData {
  savedMeals: SavedMeal[];
  plan: PlannedMeal[];
  /** Ingredient names that have been checked off */
  groceryChecked: string[];
  /**
   * Shared planning settings (which slots are enabled, week start day, default
   * serving times). These used to live on each module's config — moved here so
   * that /remote and all meal-planner module instances stay in sync.
   */
  settings: MealSettings;
}

const EMPTY: MealData = {
  savedMeals: [],
  plan: [],
  groceryChecked: [],
  settings: { ...DEFAULT_MEAL_SETTINGS },
};

/** Prune plan entries older than this many weeks */
const PRUNE_WEEKS = 12;

const mealStore = createJsonStore<MealData>({
  path: 'data/meals.json',
  defaultValue: EMPTY,
  backup: true,
  errorHandling: 'throw-corrupt',
});

// ── Migration: day-of-week → ISO date ──

function migrateLegacyPlan(plan: unknown[]): PlannedMeal[] {
  const now = new Date();
  const sunday = new Date(now);
  sunday.setDate(now.getDate() - now.getDay());

  return plan.map((raw) => {
    const entry = raw as Record<string, unknown>;
    if (typeof entry === 'object' && entry !== null && 'date' in entry && typeof entry.date === 'string') {
      return entry as unknown as PlannedMeal;
    }
    const dayNum = typeof entry.day === 'number' ? entry.day : 0;
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + dayNum);
    const { day: _day, ...rest } = entry;
    return { ...rest, date: toISODate(d) } as PlannedMeal;
  });
}

// ── Migration: pull legacy meal-planner config from data/config.json ──

const VALID_SLOT_TYPES: ReadonlySet<MealSlotType> = new Set(['breakfast', 'lunch', 'dinner', 'snack']);

interface LegacyMealBackfill {
  settingsPatch: Partial<MealSettings> | null;
  /** Embedded savedMeals harvested from all meal-planner modules, dedup'd by id */
  embeddedMeals: SavedMeal[];
  /** Embedded plan entries, with legacy day-based entries normalized to ISO dates */
  embeddedPlan: PlannedMeal[];
}

/**
 * On first read after upgrade, scan `data/config.json` for any meal-planner or
 * fullscreen-meal-planner module instances that still carry legacy data:
 *   - `slots` / `weekStartDay` → seed the new shared MealSettings
 *   - `savedMeals` / `plan` → merge into the shared meals.json
 *
 * This runs inside the `updateMealData` atomic block, so concurrent readers
 * all see the same migrated result — previously this lived client-side in
 * the editor config sections and raced when multiple meal-planner modules
 * mounted in parallel, potentially dropping each module's embedded entries.
 *
 * Conflict resolution when multiple modules disagree:
 * - `enabledSlots`: the **largest** set wins. Showing an extra slot is reversible
 *   from /remote, but silently hiding a slot the user previously had enabled
 *   would be a surprise they might not know how to undo.
 * - `weekStartDay`: the **first non-default** value found. 'sunday' is the
 *   default and may be implicit; any explicit 'monday' is a deliberate user
 *   choice we should preserve.
 * - `savedMeals`: deduplicated by id across modules.
 * - `plan`: concatenated across modules (day-based entries normalized to the
 *   current week via `migrateLegacyPlan`).
 *
 * Returns an empty (null / empty) result if nothing was found or config.json
 * could not be read.
 */
async function migrateLegacyMealSettings(): Promise<LegacyMealBackfill> {
  const empty: LegacyMealBackfill = { settingsPatch: null, embeddedMeals: [], embeddedPlan: [] };
  let config;
  try {
    // Use the canonical config reader so we benefit from its ENOENT handling,
    // schema-version migration, and corrupt-config error semantics. The reader
    // throws on corruption (rather than silently returning defaults), which we
    // surface as a console warning before falling through — this catches the
    // edge case where a corrupt config.json would have caused us to silently
    // skip migration.
    config = await readConfig();
  } catch (err) {
    console.warn('[meal-settings-migration] Failed to read config.json for legacy meal-settings backfill:', err);
    return empty;
  }

  const mealConfigs: Record<string, unknown>[] = [];
  for (const screen of config.screens ?? []) {
    for (const mod of screen.modules ?? []) {
      if (mod.type !== 'meal-planner' && mod.type !== 'fullscreen-meal-planner') continue;
      // The typed config from readConfig has `mod.config` as a per-module union;
      // we treat it as an opaque record here since the legacy fields aren't on
      // the current type.
      const cfg = mod.config as unknown;
      if (cfg && typeof cfg === 'object') {
        mealConfigs.push(cfg as Record<string, unknown>);
      }
    }
  }

  if (mealConfigs.length === 0) return empty;

  // ── enabledSlots: pick the largest valid set found across all modules ──
  let largestSlots: MealSlotType[] | null = null;
  for (const cfg of mealConfigs) {
    if (!Array.isArray(cfg.slots)) continue;
    const filtered = cfg.slots.filter(
      (s): s is MealSlotType => typeof s === 'string' && VALID_SLOT_TYPES.has(s as MealSlotType),
    );
    if (filtered.length === 0) continue;
    if (!largestSlots || filtered.length > largestSlots.length) {
      largestSlots = filtered;
    }
  }

  // ── weekStartDay: first explicit non-default found ──
  let weekStartDay: 'sunday' | 'monday' | null = null;
  for (const cfg of mealConfigs) {
    if (cfg.weekStartDay === 'monday' || cfg.weekStartDay === 'sunday') {
      weekStartDay = cfg.weekStartDay;
      if (weekStartDay !== DEFAULT_MEAL_SETTINGS.weekStartDay) break; // stop at first non-default
    }
  }

  // ── savedMeals / plan: harvest embedded data from all modules ──
  const embeddedMeals: SavedMeal[] = [];
  const seenMealIds = new Set<string>();
  const embeddedPlanRaw: unknown[] = [];
  for (const cfg of mealConfigs) {
    if (Array.isArray(cfg.savedMeals)) {
      for (const m of cfg.savedMeals as SavedMeal[]) {
        if (m && typeof m === 'object' && typeof m.id === 'string' && !seenMealIds.has(m.id)) {
          seenMealIds.add(m.id);
          embeddedMeals.push(m);
        }
      }
    }
    if (Array.isArray(cfg.plan)) {
      embeddedPlanRaw.push(...(cfg.plan as unknown[]));
    }
  }
  // Normalize day-based entries to ISO dates using the shared helper.
  const embeddedPlan = embeddedPlanRaw.length > 0 ? migrateLegacyPlan(embeddedPlanRaw) : [];

  const settingsPatch: Partial<MealSettings> | null =
    largestSlots || weekStartDay
      ? {
          ...(largestSlots ? { enabledSlots: largestSlots } : {}),
          ...(weekStartDay ? { weekStartDay } : {}),
        }
      : null;

  return { settingsPatch, embeddedMeals, embeddedPlan };
}

// ── Parse + migrate raw disk bytes into a MealData ──

/**
 * Parse the on-disk JSON and apply any pending migrations in-memory.
 * Returns the migrated data plus a flag indicating whether the file
 * needs a write-through (because something changed during migration).
 *
 * This is separated from the read path so both `readMealData` and
 * `updateMealData` can reuse the same migration logic — the update
 * path runs the migration inside an atomic read-modify-write block
 * so two concurrent migrations can't race or overwrite each other.
 */
async function parseAndMigrate(
  parsed: unknown,
): Promise<{ data: MealData; migrated: boolean }> {
  const raw = (parsed && typeof parsed === 'object' ? parsed : {}) as Record<string, unknown>;
  const data: MealData = {
    savedMeals: Array.isArray(raw.savedMeals) ? raw.savedMeals as SavedMeal[] : [],
    plan: Array.isArray(raw.plan) ? raw.plan as PlannedMeal[] : [],
    groceryChecked: Array.isArray(raw.groceryChecked) ? raw.groceryChecked as string[] : [],
    settings: normalizeMealSettings(raw.settings),
  };

  const needsMigration = (data.plan as unknown as Record<string, unknown>[]).some(
    (entry) => !('date' in entry && typeof entry.date === 'string') && 'day' in entry,
  );
  const needsPreviousPlanRemoval = Array.isArray(raw.previousPlan) && (raw.previousPlan as unknown[]).length > 0;
  const needsSettingsBackfill = !raw.settings || typeof raw.settings !== 'object';

  let backfilled = false;
  if (needsSettingsBackfill) {
    // First-read-after-upgrade: pull BOTH the settings patch and any embedded
    // savedMeals/plan from data/config.json into the shared meals.json. This
    // used to live client-side in the editor config sections and raced when
    // multiple meal-planner modules mounted in parallel. Running it here —
    // inside the atomic read-modify-write path — makes the migration
    // single-shot and deterministic.
    const legacy = await migrateLegacyMealSettings();
    if (legacy.settingsPatch) {
      data.settings = normalizeMealSettings({ ...data.settings, ...legacy.settingsPatch });
    }
    if (legacy.embeddedMeals.length > 0) {
      const existingIds = new Set(data.savedMeals.map((m) => m.id));
      for (const m of legacy.embeddedMeals) {
        if (!existingIds.has(m.id)) {
          data.savedMeals.push(m);
          existingIds.add(m.id);
        }
      }
      backfilled = true;
    }
    if (legacy.embeddedPlan.length > 0) {
      data.plan = [...data.plan, ...legacy.embeddedPlan];
      backfilled = true;
    }
  }

  if (needsMigration) {
    data.plan = migrateLegacyPlan(data.plan as unknown as unknown[]);
  }

  return {
    data,
    migrated: needsMigration || needsPreviousPlanRemoval || needsSettingsBackfill || backfilled,
  };
}

// ── Read ────────────────────────────────────────

export async function readMealData(): Promise<MealData> {
  let parsed: unknown;
  try {
    const raw = await fs.readFile(mealStore.filePath, 'utf-8');
    parsed = JSON.parse(raw);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { ...EMPTY, settings: { ...DEFAULT_MEAL_SETTINGS } };
    }
    throw err;
  }

  const { data, migrated } = await parseAndMigrate(parsed);

  if (migrated) {
    // Persist the migration through the atomic update path so concurrent
    // migration attempts serialize on the same write queue — the first
    // writer lands, subsequent readers see the migrated file and skip
    // the backfill entirely. If the write fails we still return the
    // in-memory migrated data; the next read will retry the migration.
    mealStore.updateAtomic(async (current) => {
      // Re-parse current in case a concurrent writer already migrated it.
      const { data: reparsed, migrated: stillNeeds } = await parseAndMigrate(current);
      return stillNeeds ? reparsed : current;
    }).catch(() => {});
  }

  return data;
}

/**
 * Atomic read-modify-write for meal data. The mutator receives the current
 * on-disk state (already migrated to the latest schema) and returns the new
 * state to persist. The entire cycle runs inside the json-store's write
 * queue, so cross-surface writers (editor settings, /remote meal edits,
 * grocery checks, migration) can't interleave and clobber each other.
 *
 * The mutator may throw. Throwing a `Response` short-circuits for API
 * routes that need to return a 4xx without writing (e.g. the empty-overwrite
 * guard in PUT /api/meals/data).
 *
 * **No-op signal:** if the user mutator returns the same `MealData`
 * reference it was given AND no migration was applied, the wrapper
 * returns the original `current` reference so `updateAtomic` skips the
 * disk write. Migration always forces a write (its whole point is to
 * land normalized fields on disk) regardless of whether the user
 * mutator was a no-op.
 */
export function updateMealData(
  mutator: (current: MealData) => MealData | Promise<MealData>,
): Promise<MealData> {
  return mealStore.updateAtomic(async (current) => {
    // Run the same migration logic that readMealData applies, so the
    // mutator always sees normalized data even if the file still has
    // legacy fields on disk.
    const { data, migrated } = await parseAndMigrate(current);
    const result = await mutator(data);
    // No-op fast path: user mutator returned its input unchanged AND
    // parseAndMigrate didn't backfill anything → skip the write by
    // returning the original on-disk reference.
    if (result === data && !migrated) {
      return current;
    }
    return result;
  });
}

// ── Pruning ──

export function prunePlan(plan: PlannedMeal[]): PlannedMeal[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - PRUNE_WEEKS * 7);
  const cutoffStr = toISODate(cutoff);
  return plan.filter((p) => p.date >= cutoffStr);
}

// ── Write (queued, atomic) ────────────────────

export const writeMealData = mealStore.write;
