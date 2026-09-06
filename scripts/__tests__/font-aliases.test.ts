import { describe, it, expect } from 'vitest';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { execFileSync } from 'child_process';
import { tmpdir } from 'os';
import path from 'path';

/**
 * Generic font-family aliases on the display.
 *
 * A stock Raspberry Pi OS carrying fonts-noto-color-emoji resolves
 * `fc-match sans-serif`, `serif` and `monospace` to Noto Color Emoji, which
 * has no Latin glyphs — Chromium then falls back per glyph and letters and
 * digits can come from different faces. `setup_font_aliases` in lib/common.sh
 * pins the three generics to DejaVu so CSS the app does not control (plugin
 * stylesheets, most of all) still lands on a readable face.
 *
 * Two entry points have to call it, for the same reason the boot splash does:
 * the full install runs it through `upgrade.sh setup-system`, and the
 * display-only branch of install.sh never takes that path.
 */

const SCRIPTS = path.join(process.cwd(), 'scripts');
const read = (rel: string) => readFileSync(path.join(SCRIPTS, rel), 'utf-8');

describe('setup_font_aliases', () => {
  const common = read('lib/common.sh');

  it('is defined in the shared lib', () => {
    expect(common).toContain('setup_font_aliases() {');
  });

  it('pins every generic family Raspberry Pi OS mis-resolves', () => {
    for (const family of ['sans-serif', 'serif', 'monospace']) {
      expect(common, `${family} has no alias`)
        .toMatch(new RegExp(`<family>${family}</family><prefer><family>DejaVu`));
    }
  });

  it('writes a fontconfig file and refreshes the cache', () => {
    expect(common).toContain('/etc/fonts/conf.d/59-home-screens-font-aliases.conf');
    expect(common).toContain('fc-cache -f');
  });

  it('reports its change so callers can fold it into their own tracking', () => {
    expect(common).toContain('FONT_ALIAS_CHANGES');
  });

  it('is called by both entry points', () => {
    expect(read('upgrade.sh'), 'upgrade.sh setup-system never calls it').toContain('setup_font_aliases');
    expect(read('install.sh'), 'the display-only install never calls it').toContain('setup_font_aliases');
  });

  it('installs the font package the aliases point at', () => {
    expect(read('upgrade.sh')).toContain('fonts-dejavu-core');
    expect(read('install.sh')).toContain('fonts-dejavu-core');
  });

  it.each(['custom', 'customized-rc', 'unmodified-rc'])('safely installs aliases and is idempotent with %s settings', (kind) => {
    const root = mkdtempSync(path.join(tmpdir(), 'font-alias-test-'));
    try {
      mkdirSync(path.join(root, 'etc/fonts'), { recursive: true });
      const marker = '<!-- Managed by Home Screens (setup_font_aliases). Edits will be replaced. -->';
      const custom = kind === 'unmodified-rc' ? `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
${marker}
<fontconfig>
  <alias><family>sans-serif</family><prefer><family>DejaVu Sans</family></prefer></alias>
  <alias><family>serif</family><prefer><family>DejaVu Serif</family></prefer></alias>
  <alias><family>monospace</family><prefer><family>DejaVu Sans Mono</family></prefer></alias>
</fontconfig>
` : `${kind === 'customized-rc' ? `${marker}\n` : ''}<fontconfig><match target="font"><edit name="antialias"><bool>false</bool></edit></match></fontconfig>\n`;
      writeFileSync(path.join(root, 'etc/fonts/local.conf'), custom);
      // Run the real function with filesystem commands confined to a temp
      // tree. No command here can invoke the host's sudo or font cache.
      const output = execFileSync('bash', ['-eu', '-c', `
        source "$1"
        cat() {
          case "\${1:-}" in
            /etc/fonts/*) command cat "$FONT_TEST_ROOT$1" ;;
            *) command cat "$@" ;;
          esac
        }
        sudo() {
          case "$1" in
            tee) command tee "$FONT_TEST_ROOT$2" ;;
            mkdir) command mkdir -p "$FONT_TEST_ROOT$3" ;;
            rm) command rm "$FONT_TEST_ROOT$2" ;;
            fc-cache) printf 'cache refreshed\\n' >> "$FONT_TEST_ROOT/cache.log" ;;
            *) return 99 ;;
          esac
        }
        setup_font_aliases
        printf '%s\\n' "$FONT_ALIAS_CHANGES"
        setup_font_aliases
        printf '%s\\n' "$FONT_ALIAS_CHANGES"
      `, 'font-test', path.join(SCRIPTS, 'lib/common.sh')], {
        env: { ...process.env, FONT_TEST_ROOT: root }, encoding: 'utf8',
      });
      if (kind === 'unmodified-rc') {
        expect(existsSync(path.join(root, 'etc/fonts/local.conf'))).toBe(false);
      } else {
        expect(readFileSync(path.join(root, 'etc/fonts/local.conf'), 'utf8')).toBe(custom);
      }
      expect(output).toBe('fontconfig,\n\n');
      expect(existsSync(path.join(root, 'etc/fonts/conf.d/59-home-screens-font-aliases.conf'))).toBe(true);
      expect(readFileSync(path.join(root, 'cache.log'), 'utf8')).toBe('cache refreshed\n');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
