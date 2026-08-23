import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import {
  getAllModuleDefinitions,
  MODULE_CATEGORIES,
} from '@/lib/module-registry';
import {
  MODULE_COUNT,
  MODULE_CATEGORY_COUNT,
  WEATHER_PROVIDER_COUNT,
  STANDINGS_LEAGUE_COUNT,
  CLOCK_VIEW_COUNT,
  WEATHER_VIEW_COUNT,
  SHAPE_VIEW_COUNT,
  LOCALE_COUNT,
  LOCALE_NATIVE_NAMES,
} from '../../../website/src/lib/stats';
import { LOCALES } from '@/i18n/manifest';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const TYPES_FILE = path.join(REPO_ROOT, 'src/types/config.ts');

function readUnionMembers(typeName: string): string[] {
  const content = fs.readFileSync(TYPES_FILE, 'utf8');
  const re = new RegExp(`export type ${typeName}\\s*=\\s*([\\s\\S]*?);`);
  const match = content.match(re);
  if (!match) {
    throw new Error(`Could not find "export type ${typeName}" in config.ts`);
  }
  return Array.from(match[1].matchAll(/'([^']+)'/g)).map((m) => m[1]);
}

function countWeatherProviderFiles(): number {
  // Provider files in src/lib/weather/ excluding shared infra.
  const weatherDir = path.join(REPO_ROOT, 'src/lib/weather');
  const SHARED = new Set([
    'index.ts',
    'types.ts',
    'units.ts',
    'derive.ts',
    'daily.ts',
    'fetch.ts',
    'icons.ts',
    'eccc-stations.ts',
  ]);
  return fs
    .readdirSync(weatherDir)
    .filter((f) => f.endsWith('.ts') && !SHARED.has(f)).length;
}

function countStandingsLeagues(): number {
  // Source of truth for the user-facing league list is the editor config section.
  const file = path.join(
    REPO_ROOT,
    'src/components/editor/config-sections/StandingsConfigSection.tsx',
  );
  const content = fs.readFileSync(file, 'utf8');
  const match = content.match(/STANDINGS_LEAGUES[^=]*=\s*\[([\s\S]*?)\];/);
  if (!match) {
    throw new Error('Could not find STANDINGS_LEAGUES array');
  }
  return (match[1].match(/{ value: '[a-z_0-9]+', label:/g) ?? []).length;
}

const WEBSITE_DOCS = path.join(REPO_ROOT, 'website/content/docs');

/**
 * Read a website doc page and assert the substring exists. Used for the few
 * places where Markdoc variables can't reach: YAML frontmatter and fenced
 * code blocks. If a count drifts in stats.ts, these files must be updated
 * by hand — this assertion is what makes that requirement loud.
 */
function assertContains(filePath: string, needle: string, label: string) {
  const content = fs.readFileSync(filePath, 'utf8');
  if (!content.includes(needle)) {
    throw new Error(
      `${label}: expected "${needle}" in ${path.relative(REPO_ROOT, filePath)}. ` +
        `If you bumped the value in website/src/lib/stats.ts, update this hardcoded ` +
        `string too — it lives in YAML frontmatter or a fenced code block where ` +
        `Markdoc variables can't reach.`,
    );
  }
}

describe('website stats stay in sync with the codebase', () => {
  it('MODULE_COUNT matches the live module registry', () => {
    expect(MODULE_COUNT).toBe(getAllModuleDefinitions().length);
  });

  it('MODULE_CATEGORY_COUNT matches MODULE_CATEGORIES', () => {
    expect(MODULE_CATEGORY_COUNT).toBe(MODULE_CATEGORIES.length);
  });

  it('CLOCK_VIEW_COUNT matches the ClockView union', () => {
    expect(CLOCK_VIEW_COUNT).toBe(readUnionMembers('ClockView').length);
  });

  it('WEATHER_VIEW_COUNT matches the WeatherView union', () => {
    expect(WEATHER_VIEW_COUNT).toBe(readUnionMembers('WeatherView').length);
  });

  it('SHAPE_VIEW_COUNT matches the ShapeView union', () => {
    expect(SHAPE_VIEW_COUNT).toBe(readUnionMembers('ShapeView').length);
  });

  it('WEATHER_PROVIDER_COUNT matches the provider files in src/lib/weather', () => {
    expect(WEATHER_PROVIDER_COUNT).toBe(countWeatherProviderFiles());
  });

  it('STANDINGS_LEAGUE_COUNT matches the editor StandingsConfigSection', () => {
    expect(STANDINGS_LEAGUE_COUNT).toBe(countStandingsLeagues());
  });

  it('LOCALE_COUNT matches the registered locales in src/i18n/manifest.ts', () => {
    expect(LOCALE_COUNT).toBe(Object.keys(LOCALES).length);
  });

  it('LOCALE_NATIVE_NAMES matches the manifest in registry order', () => {
    expect([...LOCALE_NATIVE_NAMES]).toEqual(
      Object.values(LOCALES).map((l) => l.nativeName),
    );
  });

  // Markdoc can't substitute variables inside YAML frontmatter or fenced code
  // blocks, so a handful of literal counts live in user-facing docs. These
  // assertions make sure those literals match stats.ts.
  it('module-reference frontmatter description carries MODULE_COUNT', () => {
    assertContains(
      path.join(WEBSITE_DOCS, 'module-reference.md'),
      `all ${MODULE_COUNT} built-in Home Screens modules`,
      'module-reference frontmatter',
    );
  });

  it('modules guide frontmatter description carries MODULE_CATEGORY_COUNT', () => {
    assertContains(
      path.join(WEBSITE_DOCS, 'modules.md'),
      `the ${MODULE_CATEGORY_COUNT} categories of built-in modules`,
      'modules-guide frontmatter',
    );
  });

  it('development guide file-tree code block carries MODULE_COUNT', () => {
    assertContains(
      path.join(WEBSITE_DOCS, 'development.md'),
      `All ${MODULE_COUNT} module components`,
      'development file-tree code block',
    );
  });

  it('og-image.html social-card template carries MODULE_COUNT', () => {
    // og-image.html is rendered headlessly to public/images/og-home.jpg (the
    // OpenGraph card embedded in social shares). It's plain HTML — no React
    // imports, no Markdoc variables — so the literal must be hand-updated
    // when MODULE_COUNT changes. This guard makes that requirement loud.
    assertContains(
      path.join(REPO_ROOT, 'website/og-image.html'),
      `<span class="num">${MODULE_COUNT}</span> modules`,
      'og-image.html social-card template',
    );
  });
});
