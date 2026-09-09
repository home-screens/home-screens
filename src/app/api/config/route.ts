import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { readConfig, writeConfig, updateConfigAtomic, configRevision } from '@/lib/config';
import { CONFIG_REVISION_HEADER } from '@/lib/config-revision';
import { appendFoldedLists, foldConfigTodos, readTodoData, settleTodoMigration } from '@/lib/todo-data';
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
  await settleTodoMigration();
  const config = await readConfig();
  maybeSendBeacon(config).catch(() => {}); // fire-and-forget daily telemetry
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
export const PUT = withAuth(async (request: NextRequest) => {
  const body = await parseJsonBody<ScreenConfiguration>(request);
  if (body instanceof NextResponse) return body;
  if (!body || !Array.isArray(body.screens) || !body.settings) {
    return NextResponse.json(
      { error: 'Invalid config: must include screens array and settings' },
      { status: 400 },
    );
  }
  const config = body;

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
  // A layout exported before to-do lists were shared still carries items
  // inline on its todo modules (importLayout never strips them). They are
  // folded into shared lists here, as part of the save, so the config the
  // editor gets back is the one on disk and its revision holds. The lists
  // are written BEFORE the config: a config pointing at lists that never
  // landed is a broken layout, while lists nobody points at yet are only a
  // wasted write, and the retry folds onto them by content anyway. If the
  // store cannot be read or written the save is refused outright.
  let saved: ScreenConfiguration = config;
  if (getAllScreens(config).some((s) => s.modules.some((m) => m.type === 'todo' && Array.isArray((m.config as { items?: unknown }).items)))) {
    // Check the revision before minting anything. The compare-and-swap below
    // is still the real gate, but without this a save that was going to be
    // refused would leave the lists it minted behind with nothing pointing
    // at them.
    const current = await readConfig().catch(() => null);
    if (expected && current && configRevision(current) !== expected) {
      return NextResponse.json(
        { error: 'The layout was changed somewhere else since it was loaded.', config: current },
        { status: 409, headers: withRevision(current) },
      );
    }
    try {
      const folded = foldConfigTodos(config, (await readTodoData()).lists);
      await appendFoldedLists(folded.created);
      saved = folded.config;
    } catch (err) {
      log.error('Could not move this layout\'s to-do items into shared lists:', err);
      return NextResponse.json(
        { error: 'Your to-do lists could not be updated, so the layout was not saved. Try again in a moment.' },
        { status: 500 },
      );
    }
  }
  try {
    await updateConfigAtomic((current) => {
      seen.prev = current;
      if (expected && configRevision(current) !== expected) {
        seen.conflict = current;
        return current;
      }
      return saved;
    });
  } catch (err) {
    // The file on disk can't be read (hand-edited into bad JSON, a failed
    // migration): there is nothing to compare against, and refusing would
    // leave the editor's good copy the only one that can't be written. Save
    // it the old way; if the write itself fails, that error still surfaces.
    log.warn('config.json unreadable, overwriting with the editor\'s copy:', err);
    await writeConfig(saved);
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
}, 'Failed to write config');
