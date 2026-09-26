import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { readConfig, updateConfigAtomic, configRevision } from '@/lib/config';
import { readConfigCached } from '@/lib/config-cache';
import { CONFIG_REVISION_HEADER } from '@/lib/config-revision';
import { HUB_TIMEZONE_HEADER } from '@/lib/timezone';
import { hubTimezone } from '@/lib/household-day';
import { settleTodoMigration } from '@/lib/todo-data';
import { saveImportedConfig } from '@/lib/family-import';
import { readTransactionFile, withDataTransaction } from '@/lib/data-transaction';
import { settleFamilyMigration } from '@/lib/family-data';
import { withFamilyData, validateMemberReferences } from '@/lib/family-api';
import { getAllScreens } from '@/lib/display-filter';
import { answersFor, wallBody, wallEtag } from '@/lib/wall-config';
import { syncKioskConf, applyDisplaySettings, applyLabwcRc, resolveHubPanel } from '@/lib/kiosk';
import { withAuth, withDisplayAuth, parseJsonBody } from '@/lib/api-utils';
import { maybeSendBeacon } from '@/lib/telemetry';
import { validateConfigForWrite } from '@/lib/config-validation';
import type { ScreenConfiguration } from '@/types/config';
import { logger } from '@/lib/logger';

const log = logger('kiosk');

export const dynamic = 'force-dynamic';

/**
 * Every config response also names the hub's own zone. With none saved it is
 * the household's zone on every surface, and only the hub knows it: a kiosk or
 * a laptop asking `Intl` gets its own machine's zone instead.
 */
function withRevision(config: ScreenConfiguration): Record<string, string> {
  return { [CONFIG_REVISION_HEADER]: configRevision(config), [HUB_TIMEZONE_HEADER]: hubTimezone() };
}

export const GET = withDisplayAuth(async (request: NextRequest) => {
  // A kiosk names its display, and a single-display wall names the legacy
  // slot; the editor names none and gets the whole document.
  const displayId = new URL(request.url).searchParams.get('display');

  // Before reading: the upgrade fold rewrites config.json, and a revision
  // handed out just before it runs is stale by the time the editor saves.
  const config = await withFamilyData(async () => {
    await settleTodoMigration();
    // A wall reads the cache, which parses the file again only when it
    // changes; so does its 3 s heartbeat, whose config revision is the ETag
    // below, so the two can never disagree about a version. The editor's read
    // stays uncached: its revision has to be computed from bytes just read
    // or a save can be compared against a stale hash.
    return displayId ? readConfigCached() : readConfig();
  });
  // Start detached telemetry only after leaving the family transaction.
  maybeSendBeacon(config).catch(() => {});

  // The revision is always the WHOLE document's hash, filtered response or
  // not: it is the editor's compare-and-swap token, and a hash over a scoped
  // body would never match what PUT compares against.
  if (!displayId) return NextResponse.json(config, { headers: withRevision(config) });

  const answers = answersFor(config);
  const zone = hubTimezone();
  const headers = {
    [CONFIG_REVISION_HEADER]: answers.revision,
    [HUB_TIMEZONE_HEADER]: zone,
    ETag: wallEtag(answers.revision, zone),
  };
  // The wall sends back the ETag of the answer it last applied.
  if (request.headers.get('if-none-match') === headers.ETag) {
    return new NextResponse(null, { status: 304, headers });
  }
  return new NextResponse(wallBody(config, answers, displayId), {
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}, 'Failed to read config');

/**
 * Whole-config save. When the client sends the revision it loaded
 * (`X-Config-Revision`), the write is a compare-and-swap: a config that
 * changed on disk since then is not overwritten, and the 409 body carries the
 * newer config (plus its revision in the header) so the editor can offer
 * "load theirs / keep mine" instead of silently undoing someone else's edit.
 * Clients that send no revision keep the old last-writer-wins behaviour.
 */
export const PUT = withAuth(async (request: NextRequest) => {
  // Parse and validate before taking the data lock: the body is the client's
  // input, not persisted state, and every display poll queues behind the
  // lock while it is held.
  const body = await parseJsonBody<ScreenConfiguration>(request);
  if (body instanceof NextResponse) return body;
  const invalid = validateConfigForWrite(body);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
  return saveConfig(request, body);
}, 'Failed to write config');

async function saveConfig(request: NextRequest, config: ScreenConfiguration): Promise<NextResponse> {
  return withDataTransaction(async () => {
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
    // and, when it changed, have labwc line touch up with the new rotation.
    syncKioskConf(saved)
      .then((wrote) => (wrote ? applyLabwcRc() : undefined))
      .catch((e) => log.error('kiosk.conf sync failed:', e));

    // Apply display rotation/mode immediately via wlr-randr (no reboot needed).
    // Only attempt when display settings actually changed.
    // Compared as the hub's resolved screen, not the raw globals: in a
    // multi-display config the rotation is edited on the main display's node.
    const before = seen.prev ? resolveHubPanel(seen.prev) : null;
    const after = resolveHubPanel(saved);
    const displayChanged = !before
      || before.transform !== after.transform
      || before.width !== after.width
      || before.height !== after.height;
    if (displayChanged) {
      applyDisplaySettings(saved).catch(() => {});
    }

    return NextResponse.json(saved, { headers: withRevision(saved) });
  });
}
