import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

/**
 * The apt packages the kiosk session runs, and every place that installs them.
 *
 * Five lists, none of which can share code with the others: setup-system on a
 * hub, the display-only installer, the Pi image build, the display-only
 * update helper (for Pis flashed before a package was added), and the install
 * emulator's stand-ins. A package missing from one of them works everywhere
 * but that one kind of device, which is the hardest way to find out.
 */

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf-8');
const words = (list: string) => list.trim().split(/\s+/).filter(Boolean);

/** What the kiosk launchers and their helpers call, one package each. */
const KIOSK_SESSION_PACKAGES = ['chromium', 'labwc', 'wtype', 'wlr-randr', 'wlopm', 'kanshi'];

/** Added after Pis were already in the field, so spokes need them pulled in. */
const ADDED_AFTER_FLASH = ['wlopm', 'kanshi'];

function hubPackages(): string[] {
  const match = read('scripts/lib/setup-system.sh').match(/REQUIRED_PACKAGES="([^"]+)"/);
  if (!match) throw new Error('no REQUIRED_PACKAGES in setup-system.sh');
  return words(match[1]);
}

function displayOnlyPackages(): string[] {
  const line = read('scripts/install.sh')
    .split('\n')
    .find((l) => /apt-get install -y -qq .*\bchromium\b/.test(l));
  if (!line) throw new Error('no display-only kiosk apt line in install.sh');
  return words(line.replace(/^.*apt-get install -y -qq/, ''));
}

function imagePackages(): string[] {
  const match = read('image-creation/scripts/03-install-deps.sh').match(/PACKAGES_DISPLAY="([^"]+)"/);
  if (!match) throw new Error('no PACKAGES_DISPLAY in 03-install-deps.sh');
  return words(match[1]);
}

function helperPackages(): string[] {
  const match = read('scripts/kiosk-update-privileged.sh').match(/^for pkg in ([^;]+); do$/m);
  if (!match) throw new Error('no package loop in kiosk-update-privileged.sh');
  return words(match[1]);
}

function emulatorStubs(): { packages: string[]; binaries: string[] } {
  const source = read('scripts/emulate-install.sh');
  const packages = source.match(/^for pkg in (chromium [^;]+); do$/m);
  const binaries = source.match(/^for b in ([^;]+); do$/m);
  if (!packages || !binaries) throw new Error('no stub lists in emulate-install.sh');
  return { packages: words(packages[1]), binaries: words(binaries[1]) };
}

/** The list setup-system and the display-only helper bring to the archive's newest version. */
function systemPackages(source: string, file: string): string[] {
  const match = source.match(/^SYSTEM_PACKAGES="([^"]+)"$/m);
  if (!match) throw new Error(`no SYSTEM_PACKAGES in ${file}`);
  return words(match[1]);
}
function packageHolds(source: string, file: string): string[] {
  const match = source.match(/^SYSTEM_PACKAGE_HOLDS="([^"]*)"$/m);
  if (!match) throw new Error(`no SYSTEM_PACKAGE_HOLDS in ${file}`);
  return words(match[1]);
}

describe('kiosk packages', () => {
  // The helper takes no input, so it carries its own copy of the list; a
  // package added to one and not the other would be kept current on hubs
  // and frozen on spokes, or the other way round.
  it('the hub and the display-only helper keep the same programs current, and hold the same', () => {
    const common = read('scripts/lib/common.sh');
    const helper = read('scripts/kiosk-update-privileged.sh');
    expect(systemPackages(helper, 'kiosk-update-privileged.sh')).toEqual(systemPackages(common, 'lib/common.sh'));
    expect(packageHolds(helper, 'kiosk-update-privileged.sh')).toEqual(packageHolds(common, 'lib/common.sh'));
    expect(systemPackages(common, 'lib/common.sh')).toEqual(expect.arrayContaining(KIOSK_SESSION_PACKAGES));
  });

  it.each([
    ['setup-system on a hub', hubPackages],
    ['the display-only installer', displayOnlyPackages],
    ['the Pi image', imagePackages],
  ])('%s installs everything the kiosk session runs', (_label, list) => {
    expect(list()).toEqual(expect.arrayContaining(KIOSK_SESSION_PACKAGES));
  });

  it('the display-only update helper installs the packages added since Pis were flashed', () => {
    expect(helperPackages()).toEqual(expect.arrayContaining(ADDED_AFTER_FLASH));
  });

  it('the install emulator stands in for every kiosk package and binary', () => {
    const { packages, binaries } = emulatorStubs();
    expect(packages).toEqual(expect.arrayContaining(KIOSK_SESSION_PACKAGES));
    expect(binaries).toEqual(expect.arrayContaining(KIOSK_SESSION_PACKAGES));
  });
});
