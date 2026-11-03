import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { execFileSync } from 'child_process';
import path from 'path';

/**
 * Which Wayland output the kiosk drives.
 *
 * `wlr-randr` reports every connector it knows about, disabled ones included,
 * as `Enabled: no`. Taking the first line therefore put the rotation and the
 * resolution on a dark screen whenever a second port was connected but off,
 * and it defeated the obvious workaround: someone who ran
 * `wlr-randr --output DP-1 --off` to get a second monitor out of the way left
 * DP-1 in the listing and kept losing to it.
 *
 * The parse used to live in three copies (both kiosk launchers and the
 * editor's live-apply path). scripts/kiosk-outputs.sh is now the writer of the
 * screen's settings. The display-only launcher keeps one copy for the boot on
 * which an older updater has installed it without the helper, and that copy
 * must stay identical. Nothing else may go back to setting the screen itself.
 */

const SCRIPTS = path.join(process.cwd(), 'scripts');
const read = (rel: string) => readFileSync(path.join(SCRIPTS, rel), 'utf-8');

/** The awk program out of a script's OUTPUT= line. */
function awkProgram(source: string): string {
  const line = source.split('\n').find((l) => l.trimStart().startsWith('OUTPUT=$(') && l.includes('awk'));
  if (!line) throw new Error('no OUTPUT= detection line found');
  const match = line.match(/awk '(.*)'\)$/);
  if (!match) throw new Error(`could not read the awk program from: ${line}`);
  return match[1];
}

const PROGRAM = awkProgram(read('kiosk-outputs.sh'));

/** Run the awk program the way the script does. */
const detect = (input: string) => execFileSync('awk', [PROGRAM], { input, encoding: 'utf8' }).trim();

/** One output block as wlr-randr prints it. */
const block = (name: string, enabled: boolean) =>
  `${name} "Some Vendor MODEL 1234 (${name})"\n`
  + '  Make: Some Vendor\n'
  + `  Enabled: ${enabled ? 'yes' : 'no'}\n`
  + '  Modes:\n'
  + '    1920x1080 px, 60.000000 Hz (preferred, current)\n'
  + '  Position: 0,0\n'
  + '  Transform: normal\n';

const CASES: Array<{ name: string; input: string; want: string }> = [
  {
    name: 'a single connected panel',
    input: block('HDMI-A-1', true),
    want: 'HDMI-A-1',
  },
  {
    name: 'skips a disabled output listed first',
    input: block('DP-1', false) + block('HDMI-A-1', true),
    want: 'HDMI-A-1',
  },
  {
    name: 'skips two disabled outputs to reach the live one',
    input: block('DP-1', false) + block('DP-2', false) + block('HDMI-A-1', true),
    want: 'HDMI-A-1',
  },
  {
    name: 'takes the first when several are live',
    input: block('DP-1', true) + block('HDMI-A-1', true),
    want: 'DP-1',
  },
  {
    name: 'falls back to the first name when none are enabled',
    input: block('DP-1', false) + block('HDMI-A-1', false),
    want: 'DP-1',
  },
  {
    name: 'falls back to HDMI-A-1 when wlr-randr says nothing',
    input: '',
    want: 'HDMI-A-1',
  },
];

describe('output detection', () => {
  it.each(CASES)('$name', ({ input, want }) => {
    expect(detect(input)).toBe(want);
  });

  it('selects on Enabled rather than on line order', () => {
    expect(PROGRAM).toContain('Enabled: yes');
    expect(PROGRAM).not.toContain('head -1');
  });

  it('keeps the display-only launcher\'s fallback copy identical', () => {
    expect(awkProgram(read('kiosk-launcher-display.sh'))).toBe(PROGRAM);
  });

  it('leaves the screen settings to kiosk-outputs.sh', () => {
    // A launcher that sets an output with wlr-randr is a second writer: its
    // one-shot rotation is gone the next time the monitor reconnects, and it
    // can land after kanshi's and undo it. Reading the listing (a bare
    // wlr-randr, to wait for a lit screen before Chromium) changes nothing.
    const hubLauncher = read('kiosk-launcher-hub.sh');
    expect(hubLauncher).toContain('kiosk-outputs.sh" start');
    expect(hubLauncher).not.toContain('wlr-randr --output');
    // The display-only launcher only sets a screen itself when the helper is
    // missing (see launcher-rotation.test.ts for what it does then).
    const spoke = read('kiosk-launcher-display.sh');
    const helperCall = spoke.indexOf('kiosk-outputs.sh" start');
    const fallback = spoke.indexOf('\nelif [ -n "${DISPLAY_TRANSFORM}" ]');
    expect(helperCall).toBeGreaterThan(-1);
    expect(fallback).toBeGreaterThan(helperCall);
    expect(spoke.indexOf('wlr-randr --output')).toBeGreaterThan(fallback);
    expect(read('rotate-display.sh')).toContain('kiosk-outputs.sh" apply');
    expect(readFileSync(path.join(process.cwd(), 'src', 'lib', 'kiosk.ts'), 'utf-8')).not.toContain("'wlr-randr'");
  });
});
