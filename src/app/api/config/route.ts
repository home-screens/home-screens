import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { readConfig, writeConfig } from '@/lib/config';
import { syncKioskConf, applyDisplaySettings } from '@/lib/kiosk';
import { withAuth, withDisplayAuth } from '@/lib/api-utils';
import { maybeSendBeacon } from '@/lib/telemetry';
import { validateDisplays } from '@/lib/display-filter';
import type { ScreenConfiguration } from '@/types/config';

export const dynamic = 'force-dynamic';

export const GET = withDisplayAuth(async () => {
  const config = await readConfig();
  maybeSendBeacon(config).catch(() => {}); // fire-and-forget daily telemetry
  return NextResponse.json(config);
}, 'Failed to read config');

export const PUT = withAuth(async (request: NextRequest) => {
  const body = await request.json();
  if (!body || !Array.isArray(body.screens) || !body.settings) {
    return NextResponse.json(
      { error: 'Invalid config: must include screens array and settings' },
      { status: 400 },
    );
  }
  const config = body as ScreenConfiguration;

  // Validate the multi-display registry if present. The validator enforces
  // unique URL-safe slugs and that screen/profile cross-references resolve.
  const displayError = validateDisplays(config);
  if (displayError) {
    return NextResponse.json({ error: displayError }, { status: 400 });
  }
  const prev = await readConfig().catch(() => null);
  await writeConfig(config);

  // Keep kiosk.conf in sync so kiosk-launcher.sh picks up changes on next boot
  syncKioskConf(config).catch((e) => console.error('[kiosk] kiosk.conf sync failed:', e));

  // Apply display rotation/mode immediately via wlr-randr (no reboot needed).
  // Only attempt when display settings actually changed.
  const displayChanged = !prev
    || prev.settings.displayTransform !== config.settings.displayTransform
    || prev.settings.displayWidth !== config.settings.displayWidth
    || prev.settings.displayHeight !== config.settings.displayHeight;
  if (displayChanged) {
    applyDisplaySettings(config).catch(() => {});
  }

  return NextResponse.json(config);
}, 'Failed to write config');
