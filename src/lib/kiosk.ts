/**
 * Kiosk display management — syncs display settings to kiosk.conf
 * (read by kiosk-launcher.sh on boot) and puts them on the screen live
 * through scripts/kiosk-outputs.sh.
 */
import { promises as fs } from 'fs';
import { execFile } from 'child_process';
import path from 'path';
import { appScriptPath } from '@/lib/app-dir';
import { getDataRoot } from '@/lib/data-root';
import { durableWriteFile } from '@/lib/data-transaction';
import { DISPLAY_TRANSFORMS, findMainDisplay, isValidTouchMatrix } from '@/lib/display-filter';
import type { ScreenConfiguration } from '@/types/config';

const KIOSK_CONF = 'data/kiosk.conf';

// The file and the scripts that read it are found by the install's pinned
// path, never process.cwd(): after an update swaps the release trees the
// working directory is the old tree, and a save landing before the service
// restarts would write the old tree's file and run the old tree's scripts.
function getKioskConfPath(): string {
  return path.join(getDataRoot(), KIOSK_CONF);
}

export interface HubPanel {
  width: number;
  height: number;
  transform: (typeof DISPLAY_TRANSFORMS)[number];
  /**
   * Six numbers that replace the touch matrix scripts/labwc-rc.sh would pick
   * from the rotation, or null when touch simply follows the rotation.
   */
  touchMatrix: number[] | null;
}

/**
 * The size and rotation of the screen plugged into this machine.
 *
 * Once a displays registry exists, the hub's own screen is the display that
 * `/display` renders (`findMainDisplay`), and the editor edits its size and
 * rotation on that node; the global values are hidden there and go stale.
 * Reading the globals regardless left the page laid out for a rotation the
 * compositor never applied. Each field falls back on its own, in the order
 * `filterConfigForDisplay` merges them: the node, the node's `settings`, the
 * globals. Without a registry the globals are the only source.
 *
 * kiosk.conf is sourced by bash, so a value outside the four real rotations
 * never leaves here: it reads as `normal`, which is also how the page treats
 * it. Saves refuse such a value too, but config.json can be edited by hand.
 *
 * scripts/lib/kiosk-conf.cjs, which setup-system runs on the Pi, is a
 * literal copy of this rule (it runs with no TypeScript beside it);
 * scripts/__tests__/kiosk-conf.test.ts keeps the two in step.
 */
export function resolveHubPanel(config: ScreenConfiguration): HubPanel {
  const s = config.settings;
  const hub = findMainDisplay(config.displays);
  const transform = hub?.displayTransform ?? hub?.settings?.displayTransform ?? s.displayTransform;
  // Unlike the fields above, an unset touch matrix is an answer ("follow the
  // rotation"), not a gap to fill: falling back to the globals here left a
  // matrix from single-display days active behind a row that said Follow,
  // with the global control hidden. The node is seeded from the globals when
  // the displays list is created, and owns the value from then on.
  const touchMatrix = hub ? hub.touchMatrix : s.touchMatrix;
  return {
    width: hub?.displayWidth ?? hub?.settings?.displayWidth ?? s.displayWidth ?? 0,
    height: hub?.displayHeight ?? hub?.settings?.displayHeight ?? s.displayHeight ?? 0,
    transform: DISPLAY_TRANSFORMS.find((t) => t === transform) ?? 'normal',
    touchMatrix: touchMatrix != null && isValidTouchMatrix(touchMatrix) ? touchMatrix : null,
  };
}

/**
 * Generate kiosk.conf content from config settings.
 * The file is pure shell key=value pairs, readable without node.
 */
export function buildKioskConf(config: ScreenConfiguration): string {
  const raw = config as unknown as Record<string, unknown>;
  const rawSettings = (raw.settings ?? {}) as Record<string, unknown>;

  const panel = resolveHubPanel(config);
  const mw = Math.max(panel.width, panel.height);
  const mh = Math.min(panel.width, panel.height);

  const lines: string[] = [];
  if (mw && mh) lines.push(`DISPLAY_MODE="${mw}x${mh}"`);
  if (panel.transform !== 'normal') {
    lines.push(`DISPLAY_TRANSFORM="${panel.transform}"`);
  }
  if (panel.touchMatrix) {
    lines.push(`TOUCH_MATRIX="${panel.touchMatrix.map((n) => String(Number(n.toFixed(6)))).join(' ')}"`);
  }
  // piVariant is set by install scripts but not in the TypeScript types.
  // Validate to prevent shell injection since kiosk.conf is sourced by bash.
  const piVariant = rawSettings.piVariant as string | undefined;
  if (piVariant && /^[a-z0-9-]+$/.test(piVariant)) lines.push(`PI_VARIANT="${piVariant}"`);

  return lines.join('\n') + '\n';
}

/**
 * Write kiosk.conf so kiosk-launcher.sh picks up display settings on next boot.
 * Called after every config write to keep kiosk.conf in sync. Resolves true
 * when the file was rewritten.
 */
export async function syncKioskConf(config: ScreenConfiguration): Promise<boolean> {
  const confPath = getKioskConfPath();
  const desired = buildKioskConf(config);
  // Only write if content changed (avoids unnecessary disk writes on Pi SD cards)
  try {
    const current = await fs.readFile(confPath, 'utf-8');
    if (current === desired) return false;
  } catch {
    // File doesn't exist yet — write it
  }
  // Whole or untouched: the kiosk scripts source this file at boot, and a
  // power cut during a plain rewrite would leave it empty or partial, which
  // boots a portrait wall unrotated until the next save.
  await durableWriteFile(confPath, desired);
  return true;
}

/**
 * Bring labwc's rc.xml in line with the kiosk.conf just written, so touch
 * turns with the screen as soon as a rotation is saved. scripts/labwc-rc.sh
 * is the file's only writer (setup-system runs it too). Called this way it only
 * replaces an rc.xml it wrote itself, so a laptop or a desktop whose labwc
 * config is its owner's is never touched.
 */
export function applyLabwcRc(): Promise<void> {
  return new Promise((resolve) => {
    execFile('bash', [appScriptPath('labwc-rc.sh')], { timeout: 5000 }, () => resolve());
  });
}

// Serialize applies so a quick second save cannot interleave its reload with
// the first one's.
let applyQueue: Promise<boolean> = Promise.resolve(false);

/**
 * Put kiosk.conf's rotation and resolution on the screen now, without a
 * reboot. Call it after `syncKioskConf` has written the file: the script reads
 * kiosk.conf, not the config passed around here.
 *
 * scripts/kiosk-outputs.sh is the only writer of the screen's settings. It
 * hands them to the kiosk session's kanshi, which also puts them back when
 * the monitor reconnects, and sets them once with wlr-randr where kanshi
 * cannot (not installed yet, not running until the next restart). It never
 * starts kanshi from here: this process is the home-screens service, and
 * anything it starts is killed on the service's next restart. On a machine
 * with no compositor (a laptop, Docker) it does nothing, and says so with
 * its own exit status.
 *
 * Resolves true when the script ran to completion, which includes finding no
 * kiosk session to set.
 */
export function applyDisplaySettings(): Promise<boolean> {
  const next = applyQueue.catch(() => false).then(runKioskOutputs);
  applyQueue = next;
  return next;
}

/** kiosk-outputs.sh's exit status for "no kiosk session here": nothing to set, nothing wrong. */
const NO_KIOSK_SESSION = 3;

function runKioskOutputs(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(
      'bash',
      [appScriptPath('kiosk-outputs.sh'), 'apply'],
      { timeout: 10000 },
      (err) => resolve(!err || err.code === NO_KIOSK_SESSION),
    );
  });
}
