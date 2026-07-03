/**
 * Pure types and constants for the shared-state bus. Kept separate from
 * shared-state-store.ts so server-side code (display-filter, schedule, the
 * config write gate) can validate keys and type snapshots without importing
 * the module that instantiates the client store singleton.
 */

export interface SharedStateEntry {
  value: string;
  updatedAt: number;
}

/** Allowed key shape — lowercase alnum plus `_ : . -`, 1–128 chars. */
export const SHARED_STATE_KEY_RE = /^[a-z0-9_:.-]{1,128}$/;

/** Upper bound enforced by SHARED_STATE_KEY_RE; exported so manifest
 *  validation can check that a key still fits after `plugin:<id>:` prefixing. */
export const MAX_SHARED_STATE_KEY_LENGTH = 128;

/** A shared-state key a producer module advertises for the editor's condition picker. */
export interface ProvidedStateKey {
  key: string;
  label: string;
  sampleValues?: string[];
}
