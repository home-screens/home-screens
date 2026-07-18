/**
 * Editor-side condition verdicts: run the SAME evaluators the display runs
 * (`evaluateVisibility` / `evaluateConditionsTri` from schedule.ts) over the
 * display's last-reported shared-state snapshot, so the editor can answer
 * "why is this module hidden right now?" without console spelunking on the
 * kiosk. Pure functions over a snapshot — no store access, fully unit-testable.
 */

import type { ModuleVisibility, VisibilityCondition } from '@/types/config';
import type { SharedStateEntry } from '@/lib/shared-state-types';
import { collectSourceKeys, evaluateConditionsTri, evaluateVisibility } from '@/lib/schedule';

/**
 * How old a display's shared-state report may be before verdicts go neutral.
 * While an editor is watching, displays re-report within ~5s of a bus change
 * and heartbeat every 30s regardless, so anything past a minute means the
 * display is offline — and a stale snapshot must never render a green verdict.
 */
export const SNAPSHOT_FRESH_MS = 60_000;

/** The slice of `DisplaySharedState` the verdict helpers need. Declared
 *  structurally so this lib module doesn't depend on the hooks layer. */
export interface SharedStateSnapshot {
  entries: Record<string, SharedStateEntry>;
  reportedAt: number | null;
}

/**
 * Convert a polled snapshot into the `ReadonlyMap` the evaluators take, or
 * null when there is nothing trustworthy to evaluate against (display never
 * reported, or the report is older than SNAPSHOT_FRESH_MS). Callers render
 * neutral UI on null — absence of data is not "unknown", it is "no verdict".
 */
export function snapshotStates(
  snapshot: SharedStateSnapshot | undefined,
  now: number,
): ReadonlyMap<string, SharedStateEntry> | null {
  if (!snapshot || snapshot.reportedAt === null) return null;
  // Server-stamped reportedAt vs the editor tab's clock: skew can make the
  // diff negative (server ahead), which is trivially fresh.
  if (now - snapshot.reportedAt > SNAPSHOT_FRESH_MS) return null;
  return new Map(Object.entries(snapshot.entries));
}

export type ConditionVerdict = 'met' | 'unmet' | 'unknown';

/**
 * Three-valued verdict for a condition list (implicit AND), Kleene semantics.
 * `now` is the wall clock a `time` condition is evaluated against — callers in
 * the editor pass a ticking, timezone-shifted clock so the chip stays live.
 */
export function conditionsVerdict(
  conditions: VisibilityCondition[],
  states: ReadonlyMap<string, SharedStateEntry>,
  now: Date = new Date(),
): ConditionVerdict {
  const v = evaluateConditionsTri(conditions, states, now);
  return v === undefined ? 'unknown' : v ? 'met' : 'unmet';
}

/** Verdict for a single condition node (any kind, including groups). */
export function conditionVerdict(
  condition: VisibilityCondition,
  states: ReadonlyMap<string, SharedStateEntry>,
  now: Date = new Date(),
): ConditionVerdict {
  return conditionsVerdict([condition], states, now);
}

export interface VisibilityExplanation {
  /** What the display decides right now — exactly `evaluateVisibility`. */
  visible: boolean;
  /**
   * Keys referenced anywhere in the tree but absent from the snapshot,
   * sorted. Non-empty means the whenUnknown gate decided `visible`, not the
   * condition tree — the least intuitive behavior in the system, so the UI
   * must call it out explicitly. May contain '' for a condition still being
   * authored (no key picked yet).
   */
  unknownKeys: string[];
}

/**
 * The header-level answer for the "why" panel: the final outcome plus which
 * missing keys (if any) short-circuited the tree via the whenUnknown gate.
 */
export function explainVisibility(
  visibility: ModuleVisibility,
  states: ReadonlyMap<string, SharedStateEntry>,
  now: Date = new Date(),
): VisibilityExplanation {
  const referenced = new Set<string>();
  collectSourceKeys(visibility.conditions, referenced);
  const unknownKeys = Array.from(referenced).filter((key) => !states.has(key)).sort();
  return { visible: evaluateVisibility(visibility, states, now), unknownKeys };
}
