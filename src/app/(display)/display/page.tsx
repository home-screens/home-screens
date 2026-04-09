import { redirect } from 'next/navigation';
import { readConfig } from '@/lib/config';
import { getDisplayToken } from '@/lib/auth';
import { findMainDisplay } from '@/lib/display-filter';
import ScreenRotator from '@/components/display/ScreenRotator';

export const dynamic = 'force-dynamic';

/**
 * Legacy single-display route. Behaves two ways depending on the config:
 *
 * - **No `displays` array** → Renders the rotator with the full unfiltered
 *   config. This is the original behavior — single Pi, all screens, no
 *   display IDs anywhere. Zero migration cost for existing users.
 *
 * - **`displays` configured** → Redirects to `/display/main` (if a display
 *   with that ID exists) or to the first display in the array. We do not
 *   silently render the unfiltered config because that would let `/display`
 *   diverge from each named display URL — confusing and brittle.
 */
export default async function DisplayPage() {
  const [config, displayToken] = await Promise.all([readConfig(), getDisplayToken()]);

  const target = findMainDisplay(config.displays);
  if (target) {
    redirect(`/display/${target.id}`);
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
