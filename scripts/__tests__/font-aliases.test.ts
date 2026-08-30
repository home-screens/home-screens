import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
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
    expect(common).toContain('/etc/fonts/local.conf');
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
});
