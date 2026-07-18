import type { Locator, Page } from '@playwright/test';
import type { ModuleType } from '@/types/config';

/**
 * Config-variant coverage data. The render matrices in modules-static/data.spec
 * exercise only each module's `defaultConfig`, and the view matrix mutates only
 * the view key — so every OTHER rendering-affecting config field is untested at
 * runtime. Each row flips one such field (or a small related cluster) and
 * asserts a content-level marker proving the flip actually changed what renders.
 *
 * Rows live in per-batch files under this directory (core, text,
 * fullscreen-calendar, …) concatenated by index.ts; the spec
 * (`module-config-variants.spec.ts`) loops the combined array and the meta
 * ratchets (`e2e/meta/coverage.spec.ts`) burn field/discriminator allowlists
 * down against it. Every field name must be verified against the module's
 * config interface in src/types/config.ts and every asserted string / class /
 * attribute against the component source in src/components/modules/.
 */
export interface ConfigVariant {
  type: ModuleType;
  /** Short slug for the test title, e.g. 'wifi-mode', 'metric-units'. */
  name: string;
  kind: 'network-free' | 'networked' | 'local-data';
  /** Stub key (see helpers/stubs.ts STUBS) — networked rows only. */
  stubKey?: string;
  /** Replace the stubKey's response body for this variant (else the shared fixture is used). */
  stubBody?: unknown;
  /** Which local API to seed before rendering — local-data rows only. */
  seed?: 'chores' | 'meals';
  /**
   * Custom payload for the seed PUT (replaces the default CHORE_DATA /
   * mealData() fixture). Lets a row prove fields the default seed can't reach
   * (meal tags/difficulty, multi-chore ordering).
   */
  seedData?: unknown;
  /**
   * Extra modules rendered on the same screen as the variant module — for
   * fields that react to ANOTHER module's runtime output (e.g. greeting's
   * weatherAware suffix consumes the weather module's event-bus publish).
   * Rendered with ids `companion-<i>`.
   */
  companions?: Array<{ type: ModuleType; config?: Record<string, unknown> }>;
  /** Global-settings overrides merged over matrixSettings() (e.g. metric units). */
  settings?: Record<string, unknown>;
  /** Config overrides merged over the registry defaultConfig. */
  config: Record<string, unknown>;
  /**
   * When true, the row is allowed to hit external hosts (blocked + recorded but
   * not asserted zero). Only rain-map needs this — it loads basemap/radar tiles
   * from CDNs unconditionally regardless of which field the row exercises.
   */
  allowsExternal?: boolean;
  /** Content-level assertion proving the variant changed rendering. */
  expect: (mod: Locator, page: Page) => Promise<void>;
}
