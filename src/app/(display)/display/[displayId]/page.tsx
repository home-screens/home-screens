import { readConfig } from '@/lib/config';
import { getDisplayToken } from '@/lib/auth';
import { filterConfigForDisplay } from '@/lib/display-filter';
import ScreenRotator from '@/components/display/ScreenRotator';
import DisplayNotFound from '@/components/display/DisplayNotFound';

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
 */
export default async function DisplayPage({
  params,
}: {
  params: Promise<{ displayId: string }>;
}) {
  const { displayId } = await params;
  const [config, displayToken] = await Promise.all([readConfig(), getDisplayToken()]);

  const filtered = filterConfigForDisplay(config, displayId);
  if (!filtered) {
    return <DisplayNotFound displayId={displayId} displayToken={displayToken ?? null} />;
  }

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', backgroundColor: '#000' }}>
      <ScreenRotator
        screens={filtered.screens}
        settings={filtered.settings}
        profiles={filtered.profiles}
        displayToken={displayToken}
        displayId={displayId}
      />
    </div>
  );
}
