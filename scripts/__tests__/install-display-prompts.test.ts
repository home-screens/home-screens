import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * prompt_display_config in install.sh: the orientation and resolution
 * questions, asked the same way by the hub install and the display-only one.
 *
 * Both installs write what it sets (WLR_TRANSFORM, DISPLAY_MODE) into
 * kiosk.conf, and the hub also into config.json, so the two variables are
 * the whole contract. install.sh cannot run off a Pi; the function is lifted
 * out of the file and run as written, with the answers on stdin and a
 * pretend /sys/class/drm for the screen's own resolution.
 */

const COMMON = path.join(process.cwd(), 'scripts', 'lib', 'common.sh');
const INSTALL = readFileSync(path.join(process.cwd(), 'scripts', 'install.sh'), 'utf-8');

function promptFunction(): string {
  const start = INSTALL.indexOf('\nprompt_display_config() {');
  if (start < 0) throw new Error('no prompt_display_config in install.sh');
  return INSTALL.slice(start + 1, INSTALL.indexOf('\n}\n', start) + 3);
}

let root: string;
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'hs-display-prompts-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** A pretend /sys/class/drm. `modes` is what the connected screen lists, best first. */
function drm(modes: string[] | null): string {
  const dir = path.join(root, 'drm');
  mkdirSync(dir, { recursive: true });
  if (modes) {
    // A connector with nothing plugged in lists no modes; the screen is on the second.
    mkdirSync(path.join(dir, 'card1-HDMI-A-1'), { recursive: true });
    writeFileSync(path.join(dir, 'card1-HDMI-A-1', 'modes'), '');
    mkdirSync(path.join(dir, 'card1-HDMI-A-2'), { recursive: true });
    writeFileSync(path.join(dir, 'card1-HDMI-A-2', 'modes'), modes.map((m) => `${m}\n`).join(''));
  }
  return dir;
}

interface Asked { transform: string; mode: string; output: string }

function ask({ answers = '', nonInteractive = false, modes = null as string[] | null } = {}): Asked {
  const vars = path.join(root, 'vars');
  const script = [
    'set -euo pipefail',
    `source "${COMMON}"`,
    `NON_INTERACTIVE="${nonInteractive}"`,
    promptFunction(),
    'prompt_display_config',
    // Into a file, apart from what the person sees.
    `printf '%s\\n%s\\n' "\${WLR_TRANSFORM}" "\${DISPLAY_MODE}" > "${vars}"`,
  ].join('\n');
  const output = execFileSync('bash', ['-c', `${script}\n`], {
    encoding: 'utf-8',
    input: answers,
    env: { ...process.env, HS_DRM_DIR: drm(modes) },
  });
  const [transform, mode] = readFileSync(vars, 'utf-8').split('\n');
  return { transform, mode, output: output.replace(/\u001b\[[0-9;]*m/g, '') };
}

describe('prompt_display_config', () => {
  it('is what both the hub install and the display-only install call', () => {
    expect(INSTALL.match(/^\s*prompt_display_config$/gm)).toHaveLength(2);
    // The questions are written once.
    expect(INSTALL.match(/How is your display oriented\?/g)).toHaveLength(1);
    expect(INSTALL.match(/read -rp " {2}Resolution \[auto\]: "/g)).toHaveLength(1);
  });

  describe('when asking', () => {
    it.each([
      ['', '90', 'Enter means portrait'],
      ['1', '90', 'portrait'],
      ['2', '270', 'portrait the other way'],
      ['3', '', 'landscape, no rotation'],
      ['4', '180', 'upside down'],
      ['9', '90', 'anything else means portrait'],
      ['landscape', '90', 'a word means portrait'],
    ])('orientation answer %j sets WLR_TRANSFORM to %j (%s)', (answer, transform) => {
      expect(ask({ answers: `${answer}\n\n` }).transform).toBe(transform);
    });

    it('uses the resolution that was typed, whatever the screen prefers', () => {
      expect(ask({ answers: '2\n1280x720\n', modes: ['2560x1440', '1920x1080'] })).toMatchObject({ transform: '270', mode: '1280x720' });
      expect(ask({ answers: '3\n3840x2160\n' })).toMatchObject({ transform: '', mode: '3840x2160' });
    });

    it('uses the screen\'s first listed resolution when the answer is left blank', () => {
      const asked = ask({ answers: '\n\n', modes: ['2560x1440', '1920x1080'] });
      expect(asked).toMatchObject({ transform: '90', mode: '2560x1440' });
      expect(asked.output).toContain('[*] Auto-detected display resolution: 2560x1440');
    });

    it('leaves the resolution unset when the answer is blank and the screen reports nothing', () => {
      expect(ask({ answers: '4\n\n' })).toMatchObject({ transform: '180', mode: '' });
      expect(ask({ answers: '4\n\n', modes: [] })).toMatchObject({ transform: '180', mode: '' });
    });

    it('shows the four choices and the resolution hint', () => {
      const { output } = ask({ answers: '\n\n' });
      for (const line of [
        '  How is your display oriented?',
        '  1) Portrait (default, rotated 90° clockwise)',
        '  2) Portrait (rotated 90° counter-clockwise)',
        '  3) Landscape (no rotation)',
        '  4) Inverted (rotated 180°)',
        '  Enter display resolution (e.g. 1920x1080, 2560x1440)',
        "  Leave blank to use the display's preferred resolution.",
      ]) expect(output).toContain(`${line}\n`);
    });
  });

  describe('with --non-interactive', () => {
    it('asks nothing: portrait, at the resolution the screen prefers', () => {
      // No answers on stdin: a question would end the script on the empty read.
      const asked = ask({ nonInteractive: true, modes: ['1920x1080', '1280x720'] });
      expect(asked).toMatchObject({ transform: '90', mode: '1920x1080' });
      expect(asked.output).toBe('[*] Auto-detected display resolution: 1920x1080\n');
    });

    it('leaves the resolution unset when the screen reports nothing', () => {
      const asked = ask({ nonInteractive: true });
      expect(asked).toMatchObject({ transform: '90', mode: '' });
      expect(asked.output).toBe('[*] Using default display config (portrait 90°, 1080×1920).\n');
    });
  });

  it('survives the strict mode install.sh runs under on every path', () => {
    // A function that ends on a test that came out false returns 1, and
    // `set -e` would end the install there. Every path has to return 0.
    expect(() => ask({ answers: '3\n\n' })).not.toThrow();
    expect(() => ask({ nonInteractive: true })).not.toThrow();
  });
});
