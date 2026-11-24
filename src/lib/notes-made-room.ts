/**
 * What a new drawing took down to make room (`makeRoomForDrawing`), kept for
 * the few minutes its Undo is good for: taking the new drawing off again
 * puts those back up, so an Undo never leaves the board one drawing short.
 * Memory only, on `globalThis` because the post and the delete are different
 * route files; a restart forgets, and the phone's Gone group still has them.
 */
import { WALL_UNDO_MS } from '@/lib/undo-window';

/** A drawing taken down: its id and when it would have left the wall by itself. */
export interface TakenDown { id: string; expiresAt: string | null; downAt: string }

type Ledger = Map<string, { taken: TakenDown[]; at: number }>;
const key = Symbol.for('home-screens.notes-made-room.v1');
const globals = globalThis as typeof globalThis & { [key]?: Ledger };
const ledger: Ledger = globals[key] ??= new Map();

function sweep(now: number): void {
  for (const [id, entry] of ledger) if (now - entry.at > WALL_UNDO_MS) ledger.delete(id);
}

/** Remember what posting `createdId` took down. */
export function rememberMadeRoom(createdId: string, taken: TakenDown[], now = Date.now()): void {
  sweep(now);
  if (taken.length > 0) ledger.set(createdId, { taken, at: now });
}

/** What `createdId` took down, if its Undo is still good. Forgotten once asked for. */
export function takeMadeRoom(createdId: string, now = Date.now()): TakenDown[] {
  sweep(now);
  const entry = ledger.get(createdId);
  ledger.delete(createdId);
  return entry ? entry.taken : [];
}

/** Tests only. */
export function resetMadeRoom(): void {
  ledger.clear();
}
