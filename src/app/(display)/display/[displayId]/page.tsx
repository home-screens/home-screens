import { readConfig } from '@/lib/config';
import { wallPageAccess } from '@/lib/wall-page-access';
import WallGate from '@/components/display/WallGate';
import KeepAsWallLine from '@/components/display/KeepAsWallLine';
import { displayDescriptors, filterConfigForDisplay } from '@/lib/display-filter';
import ScreenRotator from '@/components/display/ScreenRotator';
import { hubTimezone } from '@/lib/household-day';
import { wallConfigEtag } from '@/lib/wall-config';
import DisplayNotFound from '@/components/display/DisplayNotFound';
import { parseDisplaySearchParams, type DisplaySearchParams } from '@/lib/display-search-params';

export const dynamic = 'force-dynamic';

/**
 * Per-display dynamic route. URL: /display/<id>
 *
 * Filters the shared config to the screens, profiles, and settings that
 * belong to one named display, then mounts the standard `ScreenRotator`.
 * From the rotator's perspective the work is unchanged — it still receives
 * a flat screens array and merged settings — so all the existing
 * rotation, sleep, alert, and plugin code paths Just Work.
 *
 * If the display ID does not exist in the config, we render `DisplayNotFound`,
 * which polls the hub for adoption and navigates to this same URL once the
 * editor adds the display to `displays`. The display ID still gets registered
 * in `knownDisplays` via the command poll, so it shows up in the editor's
 * "Unadopted Displays" section automatically.
 *
 * On a hub with a password, a browser that has not been let in sees neither:
 * it gets `WallGate` (see `wall-page-access.ts`).
 */
export default async function DisplayPage({
  params,
  searchParams,
}: {
  params: Promise<{ displayId: string }>;
  searchParams: Promise<DisplaySearchParams>;
}) {
  const { displayId } = await params;
  const [config, access, preview] = await Promise.all([readConfig(), wallPageAccess(), searchParams.then(parseDisplaySearchParams)]);

  const filtered = filterConfigForDisplay(config, displayId);
  // Before anything about the layout is rendered: a browser that has not
  // been let in gets the gate, which asks the hub and never sees the wall.
  // For a display the hub does not know yet, asking is also what puts it on
  // the editor's "waiting to be added" list.
  if (!access.show) return <WallGate displayId={displayId} known={Boolean(filtered)} />;
  if (!filtered) {
    return <DisplayNotFound displayId={displayId} />;
  }

  const availableDisplays = displayDescriptors(config.displays);

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', backgroundColor: '#000' }}>
      <ScreenRotator
        screens={filtered.screens}
        settings={filtered.settings}
        profiles={filtered.profiles}
        rules={filtered.rules}
        hubTimezone={hubTimezone()}
        configEtag={wallConfigEtag(config)}
        displayId={displayId}
        initialDisplays={availableDisplays}
        {...preview}
      />
      {access.onSignInOnly && !preview.preview && <KeepAsWallLine displayId={displayId} />}
    </div>
  );
}
