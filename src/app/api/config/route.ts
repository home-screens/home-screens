import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { readConfig, updateConfigAtomic, configRevision } from '@/lib/config';
import { CONFIG_REVISION_HEADER } from '@/lib/config-revision';
import { settleTodoMigration } from '@/lib/todo-data';
import { saveImportedConfig } from '@/lib/family-import';
import { readTransactionFile, withDataTransaction } from '@/lib/data-transaction';
import { settleFamilyMigration } from '@/lib/family-data';
import { withFamilyData, validateMemberReferences } from '@/lib/family-api';
import { getAllScreens } from '@/lib/display-filter';
import { syncKioskConf, applyDisplaySettings } from '@/lib/kiosk';
import { withAuth, withDisplayAuth, parseJsonBody } from '@/lib/api-utils';
import { maybeSendBeacon } from '@/lib/telemetry';
import { validateDisplays, validateAllSchedules } from '@/lib/display-filter';
import type { ScreenConfiguration } from '@/types/config';
import { logger } from '@/lib/logger';

const log = logger('kiosk');

export const dynamic = 'force-dynamic';

function withRevision(config: ScreenConfiguration): Record<string, string> {
  return { [CONFIG_REVISION_HEADER]: configRevision(config) };
}

export const GET = withDisplayAuth(async () => {
  // Before reading: the upgrade fold rewrites config.json, and a revision
  // handed out just before it runs is stale by the time the editor saves.
  const config = await withFamilyData(async () => {
    await settleTodoMigration();
    return readConfig();
  });
  // Start detached telemetry only after leaving the family transaction.
  maybeSendBeacon(config).catch(() => {});
  return NextResponse.json(config, { headers: withRevision(config) });
}, 'Failed to read config');

/**
 * Whole-config save. When the client sends the revision it loaded
 * (`X-Config-Revision`), the write is a compare-and-swap: a config that
 * changed on disk since then is not overwritten, and the 409 body carries the
 * newer config (plus its revision in the header) so the editor can offer
 * "load theirs / keep mine" instead of silently undoing someone else's edit.
 * Clients that send no revision keep the old last-writer-wins behaviour.
 */
export const PUT = withAuth(async (request: NextRequest) => withDataTransaction(async () => {
  const body = await parseJsonBody<ScreenConfiguration>(request);
  if (body instanceof NextResponse) return body;
  if (!body || !Array.isArray(body.screens) || !body.settings) {
    return NextResponse.json(
      { error: 'Invalid config: must include screens array and settings' },
      { status: 400 },
    );
  }
  const config = body;

  const mappings = config.settings.calendar?.personSources;
  if (mappings !== undefined && (!mappings || typeof mappings !== 'object' || Array.isArray(mappings)
    || Object.values(mappings).some((ids) => !Array.isArray(ids) || ids.some((id) => typeof id !== 'string')))) {
    return NextResponse.json({ error: 'Calendar ownership must list calendar source ids for each person.' }, { status: 400 });
  }

  // Validate the multi-display registry if present. The validator enforces
  // unique URL-safe slugs and that screen/profile cross-references resolve.
  const displayError = validateDisplays(config);
  if (displayError) {
    return NextResponse.json({ error: displayError }, { status: 400 });
  }

  // Validate every screen/module schedule and every module's visibility
  // conditions so malformed gating is rejected at write time instead of
  // silently misbehaving at runtime.
  const scheduleError = validateAllSchedules(config);
  if (scheduleError) {
    return NextResponse.json({ error: scheduleError }, { status: 400 });
  }

  // The revision check and the write happen inside the store's queue, so a
  // save that lands between our read and our write is seen, not clobbered.
  const expected = request.headers.get(CONFIG_REVISION_HEADER);
  const seen: { prev: ScreenConfiguration | null; conflict: ScreenConfiguration | null } = { prev: null, conflict: null };
  // A validated editor copy can repair syntactically broken config data.
  // Only the replaced config may be corrupt: lock/recovery/permission errors
  // still fail, and the journal keeps its exact corrupt before-image.
  const raw = await readTransactionFile('data/config.json');
  let corrupt = false;
  if (raw !== null) {
    try { JSON.parse(raw); } catch { corrupt = true; }
  }
  if (!corrupt) await settleFamilyMigration();
  const current = corrupt ? null : await readConfig();
  if (current && expected && configRevision(current) !== expected) {
    return NextResponse.json(
      { error: 'The layout was changed somewhere else since it was loaded.', config: current },
      { status: 409, headers: withRevision(current) },
    );
  }
  let saved: ScreenConfiguration = config;
  const legacy = config.settings.calendar?.people !== undefined
    || getAllScreens(config).some((screen) => screen.modules.some((mod) => mod.type === 'todo' && Array.isArray((mod.config as { items?: unknown }).items)));
  if (legacy || corrupt) {
    seen.prev = current;
    saved = await saveImportedConfig(config);
  } else {
    const references = await validateMemberReferences(Object.keys(config.settings.calendar?.personSources ?? {}));
    if (references) return references;
    await updateConfigAtomic((latest) => {
      seen.prev = latest;
      if (expected && configRevision(latest) !== expected) {
        seen.conflict = latest;
        return latest;
      }
      return saved;
    });
  }
  if (seen.conflict) {
    return NextResponse.json(
      { error: 'The layout was changed somewhere else since it was loaded.', config: seen.conflict },
      { status: 409, headers: withRevision(seen.conflict) },
    );
  }

  // Keep kiosk.conf in sync so kiosk-launcher.sh picks up changes on next boot
  syncKioskConf(saved).catch((e) => log.error('kiosk.conf sync failed:', e));

  // Apply display rotation/mode immediately via wlr-randr (no reboot needed).
  // Only attempt when display settings actually changed.
  const before = seen.prev;
  const displayChanged = !before
    || before.settings.displayTransform !== config.settings.displayTransform
    || before.settings.displayWidth !== config.settings.displayWidth
    || before.settings.displayHeight !== config.settings.displayHeight;
  if (displayChanged) {
    applyDisplaySettings(saved).catch(() => {});
  }

  return NextResponse.json(saved, { headers: withRevision(saved) });
}), 'Failed to write config');
