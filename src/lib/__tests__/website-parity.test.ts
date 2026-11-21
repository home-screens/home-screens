// The website and the Cloudflare workers are separate programs that do not
// import the app's source, so each keeps its own copy of a few rules and
// constants. These tests hold every copy against the app's.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import { compareSemver as appCompareSemver } from '@/lib/semver';
import { sortVersionsDesc as appSortVersionsDesc } from '@/lib/plugin-versions';
import { versionOfTag as appVersionOfTag } from '@/lib/update-policy';
import { MODULE_CATEGORIES } from '@/lib/module-registry';
import { HOSTED_CALENDAR_CLIENT_ID, HOSTED_PHOTOS_CLIENT_ID } from '@/lib/google-hosted';
import { REDIRECT_URI as APP_REDIRECT_URI } from '@/lib/google-picker';
import { beginSignIn, clearPendingSignIn } from '@/lib/google-picker-sign-in';
import type {
  PluginPermission as AppPluginPermission,
  RegistryPlugin as AppRegistryPlugin,
  RegistryPluginVersion as AppRegistryPluginVersion,
} from '@/types/plugins';

import { compareSemver as siteCompareSemver } from '../../../website/src/lib/semver';
import { sortVersionsDesc as siteSortVersionsDesc } from '../../../website/src/lib/plugin-directory';
import { versionOfTag as siteVersionOfTag } from '../../../website/src/lib/plugin-submission';
import {
  PLUGIN_CATEGORIES,
  PLUGIN_PERMISSIONS,
  type RegistryPlugin as SiteRegistryPlugin,
  type RegistryPluginVersion as SiteRegistryPluginVersion,
} from '../../../website/src/lib/plugin-registry-types';
import { HUB_RETURN_PATH, hubReturnOrigin } from '../../../website/src/lib/hub-return';

import {
  CALENDAR_CLIENT_ID as WORKER_CALENDAR_CLIENT_ID,
  PHOTOS_CLIENT_ID as WORKER_PHOTOS_CLIENT_ID,
  REDIRECT_URI as WORKER_REDIRECT_URI,
} from '../../../infrastructure/google-oauth-worker/config';

const REPO_ROOT = path.resolve(__dirname, '../../..');

/* ─── Registry shapes, checked by `tsc --noEmit`, not by the test run ─── */

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

/** The pictures list is the website's own; hubs never read it. */
type SiteOnlyPluginField = 'screenshots';

// Each line stops compiling when the two trees disagree: a field added,
// removed or renamed on one side, or a field whose type changed.
const registryShapesAgree: [
  Same<keyof SiteRegistryPluginVersion, keyof AppRegistryPluginVersion>,
  Same<SiteRegistryPluginVersion, AppRegistryPluginVersion>,
  Same<Exclude<keyof SiteRegistryPlugin, SiteOnlyPluginField>, keyof AppRegistryPlugin>,
  Same<Omit<SiteRegistryPlugin, SiteOnlyPluginField>, AppRegistryPlugin>,
] = [true, true, true, true];

// The compiler refuses this object unless it names every permission in the
// app's union and nothing else, which gives the union a runtime list.
const APP_PERMISSIONS: Record<AppPluginPermission, true> = {
  network: true,
  secrets: true,
  events: true,
  storage: true,
  localNetwork: true,
  oauth: true,
};

/* ─── Versions ─── */

const VERSIONS = [
  '0.9.0',
  '1.0.0',
  '1.0.1',
  '1.2.0',
  '1.10.0',
  '2.0.0',
  '1.0',
  '1',
  '1.0.0-rc.0',
  '1.0.0-rc.1',
  '1.0.0-rc.10',
  '1.0.0-rc',
  '1.0.0-beta.2',
  '1.0.0-alpha',
  '1.0.0-dev.20260908',
  '1.0.0-1',
  '1.0.0-rc.1.2',
  'v1.0.0',
  'not-a-version',
  '',
];

const VERSION_PAIRS = VERSIONS.flatMap((a) => VERSIONS.map((b) => [a, b] as const));

describe('semver on the website and in the app', () => {
  it.each(VERSION_PAIRS)('compares %j with %j the same way', (a, b) => {
    // toBe uses Object.is, so NaN on one side must be NaN on the other.
    expect(siteCompareSemver(a, b)).toBe(appCompareSemver(a, b));
  });

  it('sorts a version list newest first in the same order', () => {
    const parseable = VERSIONS.filter((v) => !Number.isNaN(appCompareSemver(v, '1.0.0')));
    const entries = [...parseable, ...parseable.slice().reverse()].map((version, i) => ({
      version,
      minAppVersion: '1.0.0',
      downloadUrl: `https://example.com/${i}.tgz`,
      sha256: String(i),
    }));
    const site = siteSortVersionsDesc(entries);
    expect(site).toEqual(appSortVersionsDesc(entries));
    expect(site[0].version).toBe('2.0.0');
  });

  it.each(['v1.2.3', '1.2.3', 'V1.2.3', 'vv1.2.3', 'v1.2.3-rc.1', ''])(
    'reads the version out of the tag %j the same way',
    (tag) => {
      expect(siteVersionOfTag(tag)).toBe(appVersionOfTag(tag));
    },
  );
});

/* ─── Plugin registry vocabulary ─── */

describe('plugin registry words on the website and in the app', () => {
  it('the registry shapes agree (the compiler checks this one)', () => {
    expect(registryShapesAgree).toEqual([true, true, true, true]);
  });

  it('lists the same permissions', () => {
    expect([...PLUGIN_PERMISSIONS].sort()).toEqual(Object.keys(APP_PERMISSIONS).sort());
    expect(new Set(PLUGIN_PERMISSIONS).size).toBe(PLUGIN_PERMISSIONS.length);
  });

  it('lists the editor categories a plugin can sit in, in the editor order', () => {
    // Full Screen is for the built-in screen modules; the registry does not offer it.
    expect([...PLUGIN_CATEGORIES]).toEqual(MODULE_CATEGORIES.filter((c) => c !== 'Full Screen'));
  });
});

/* ─── Hosted Google sign-in ─── */

describe('hosted Google sign-in across the app, the worker and the website', () => {
  afterEach(() => clearPendingSignIn());

  it('the app and the worker name the same two Google apps', () => {
    expect(HOSTED_CALENDAR_CLIENT_ID).toBe(WORKER_CALENDAR_CLIENT_ID);
    expect(HOSTED_PHOTOS_CLIENT_ID).toBe(WORKER_PHOTOS_CLIENT_ID);
    expect(HOSTED_CALENDAR_CLIENT_ID).not.toBe(HOSTED_PHOTOS_CLIENT_ID);
  });

  it('the app and the worker send Google back to the same page', () => {
    expect(APP_REDIRECT_URI).toBe(WORKER_REDIRECT_URI);
  });

  it.each(['http://192.168.1.50:3000', 'http://homescreens.local:3000', 'https://10.0.0.7'])(
    'the website reads the hub address %s out of a state the app wrote',
    (address) => {
      const { state } = beginSignIn(address);
      expect(hubReturnOrigin(state)).toBe(address);
    },
  );

  it('the website finds no address in a state the app wrote without one', () => {
    const { state } = beginSignIn(null);
    expect(hubReturnOrigin(state)).toBeNull();
  });

  it('the page the website forwards to exists in the app', () => {
    expect(HUB_RETURN_PATH.startsWith('/')).toBe(true);
    const page = path.join(REPO_ROOT, 'src/app/(connect)', HUB_RETURN_PATH, 'page.tsx');
    expect(fs.existsSync(page)).toBe(true);
  });
});
