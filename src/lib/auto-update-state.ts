import { createJsonStore } from './json-store';
import type { AutoUpdateState } from './auto-update-policy';

/**
 * The last automatic update run (see `auto-update-policy.ts`). Runtime state:
 * it names no family member and is not part of a backup, so it stays out of
 * the data transaction. Read by the System page through the version route and
 * copied into the diagnostics bundle.
 */
const store = createJsonStore<AutoUpdateState | null>({
  path: 'data/auto-update-state.json',
  defaultValue: null,
  transient: true,
});

function isState(value: unknown): value is AutoUpdateState {
  const v = value as Partial<AutoUpdateState> | null;
  return typeof v?.runDate === 'string'
    && typeof v.at === 'string'
    && (v.result === 'installed' || v.result === 'skipped' || v.result === 'failed');
}

export async function readAutoUpdateState(): Promise<AutoUpdateState | null> {
  const value = await store.read();
  return isState(value) ? value : null;
}

export async function writeAutoUpdateState(state: AutoUpdateState): Promise<void> {
  await store.write(state);
}

/**
 * The setting as the scheduler last saw it, and when it last changed (see
 * `RunTiming.changedAt`). On disk so a restart keeps the promise: turning the
 * setting on after today's time means tomorrow, not the first minute after
 * the next restart.
 */
export interface AutoUpdateSettingChange {
  signature: string;
  changedAt: number | null;
}

const settingStore = createJsonStore<AutoUpdateSettingChange | null>({
  path: 'data/auto-update-setting.json',
  defaultValue: null,
  transient: true,
});

function isSettingChange(value: unknown): value is AutoUpdateSettingChange {
  const v = value as Partial<AutoUpdateSettingChange> | null;
  return typeof v?.signature === 'string' && (v.changedAt === null || typeof v.changedAt === 'number');
}

export async function readAutoUpdateSettingChange(): Promise<AutoUpdateSettingChange | null> {
  const value = await settingStore.read();
  return isSettingChange(value) ? value : null;
}

export async function writeAutoUpdateSettingChange(change: AutoUpdateSettingChange): Promise<void> {
  await settingStore.write(change);
}
