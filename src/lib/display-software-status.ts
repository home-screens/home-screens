import type { DisplaySoftwareInfo } from '@/lib/displays-api-types';

/**
 * Which of the five things we can say about a display's local software.
 *
 * Kept as a pure function separate from the React component so the branching
 * — which is the whole substance of this feature's UI — can be unit-tested,
 * and so the per-display page and the displays index can never disagree
 * about what a given heartbeat means.
 */
export type DisplaySoftwareState =
  /** No reporter has run on this Pi. Says nothing about the updater. */
  | { kind: 'unreported' }
  /** A reporter ran and found no automatic updates installed. */
  | { kind: 'needs-setup' }
  /** Automatic updates are installed but no version has been applied yet. */
  | { kind: 'pending' }
  | { kind: 'current'; version: string }
  | { kind: 'outdated'; version: string; hubVersion: string };

export function resolveDisplaySoftwareState(
  displaySoftware: DisplaySoftwareInfo | undefined,
  hubVersion: string | undefined | null,
): DisplaySoftwareState {
  if (!displaySoftware) return { kind: 'unreported' };
  if (!displaySoftware.updater) return { kind: 'needs-setup' };
  const { version } = displaySoftware;
  if (!version) return { kind: 'pending' };
  // An unknown hub version (the poll hasn't landed yet) must not be reported
  // as a mismatch — "we don't know" is not "out of date".
  if (!hubVersion || version === hubVersion) return { kind: 'current', version };
  return { kind: 'outdated', version, hubVersion };
}

/**
 * The copy-paste command that puts a pre-automatic-updates Pi onto the
 * self-updating path. Built from the browser's own origin: whatever address
 * the user reached the editor at is by definition one that resolves on this
 * network, which a stored hub hostname may not be.
 */
export function buildDisplaySoftwareSetupCommand(origin: string, displayId: string): string {
  return `curl -fsS "${origin.replace(/\/$/, '')}/api/display/kiosk-bootstrap?display=${displayId}" | bash`;
}
