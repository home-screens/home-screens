import { readConfig } from '@/lib/config';
import { getDisplayToken } from '@/lib/auth';
import { filterConfigForDisplay, findMainDisplay } from '@/lib/display-filter';
import ScreenRotator from '@/components/display/ScreenRotator';
import DisplayNotFound from '@/components/display/DisplayNotFound';

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
export default async function DisplayPage() {
  const [config, displayToken] = await Promise.all([readConfig(), getDisplayToken()]);

  const target = findMainDisplay(config.displays);
  if (target) {
    const filtered = filterConfigForDisplay(config, target.id);
    if (!filtered) {
      return <DisplayNotFound displayId={target.id} displayToken={displayToken ?? null} />;
    }
    return (
      <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', backgroundColor: '#000' }}>
        <ScreenRotator
          screens={filtered.screens}
          settings={filtered.settings}
          profiles={filtered.profiles}
          displayToken={displayToken}
          displayId={target.id}
        />
      </div>
    );
  }

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', backgroundColor: '#000' }}>
      <ScreenRotator
        screens={config.screens}
        settings={config.settings}
        profiles={config.profiles}
        displayToken={displayToken}
      />
    </div>
  );
}
