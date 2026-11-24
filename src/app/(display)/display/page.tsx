import { readConfig } from '@/lib/config';
import { wallPageAccess } from '@/lib/wall-page-access';
import WallGate from '@/components/display/WallGate';
import KeepAsWallLine from '@/components/display/KeepAsWallLine';
import { displayDescriptors, filterConfigForDisplay, findMainDisplay } from '@/lib/display-filter';
import ScreenRotator from '@/components/display/ScreenRotator';
import { hubTimezone } from '@/lib/household-day';
import { wallConfigEtag } from '@/lib/wall-config';
import DisplayNotFound from '@/components/display/DisplayNotFound';
import { parseDisplaySearchParams, type DisplaySearchParams } from '@/lib/display-search-params';

export const dynamic = 'force-dynamic';

/**
 * Legacy single-display route. Behaves two ways depending on the config:
 *
 * - **No `displays` array** → Renders the rotator with the full unfiltered
 *   config. This is the original behavior — single Pi, all screens, no
 *   display IDs anywhere. Zero migration cost for existing users.
 *
 * - **`displays` configured** → Renders the main display (or first display)
 *   inline, passing the `displayId` so command polling targets the correct
 *   per-display queue. We avoid a server-side redirect here because
 *   Chromium `--app` mode creates a duplicate window when following a 307
 *   redirect with an RSC body — the `--app` URL opens one window and the
 *   redirect target opens another, causing both to drain the same command
 *   queue and silently swallow remote-control commands.
 */
export default async function DisplayPage({
  searchParams,
}: {
  searchParams: Promise<DisplaySearchParams>;
}) {
  const [config, access, preview] = await Promise.all([readConfig(), wallPageAccess(), searchParams.then(parseDisplaySearchParams)]);

  const availableDisplays = displayDescriptors(config.displays);

  const target = findMainDisplay(config.displays);
  // Before anything about the layout is rendered: a browser that has not
  // been let in gets the gate, which asks the hub and never sees the wall.
  if (!access.show) return <WallGate displayId={target?.id} known />;
  if (target) {
    const filtered = filterConfigForDisplay(config, target.id);
    if (!filtered) {
      return <DisplayNotFound displayId={target.id} />;
    }
    return (
      <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', backgroundColor: '#000' }}>
        <ScreenRotator
          screens={filtered.screens}
          settings={filtered.settings}
          profiles={filtered.profiles}
          rules={filtered.rules}
          hubTimezone={hubTimezone()}
          configEtag={wallConfigEtag(config)}
          displayId={target.id}
          initialDisplays={availableDisplays}
          {...preview}
        />
        {access.onSignInOnly && !preview.preview && <KeepAsWallLine displayId={target.id} />}
      </div>
    );
  }

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', backgroundColor: '#000' }}>
      <ScreenRotator
        screens={config.screens}
        settings={config.settings}
        profiles={config.profiles}
        rules={config.rules}
        hubTimezone={hubTimezone()}
        configEtag={wallConfigEtag(config)}
        initialDisplays={availableDisplays}
        {...preview}
      />
      {access.onSignInOnly && !preview.preview && <KeepAsWallLine />}
    </div>
  );
}
