import type { ReactNode } from 'react';
import { settingsPath } from '@/lib/settings-route';

export type BackgroundIntegration = 'immich' | 'unsplash' | 'nasa';

/** Link to the Settings > Integrations card for a background source that still needs its key. */
export default function IntegrationSettingsLink({ integration, children }: { integration: BackgroundIntegration; children: ReactNode }) {
  return (
    <a
      href={settingsPath({ kind: 'defaults', page: 'integrations' }, { highlight: `integrations.${integration}` })}
      className="font-semibold text-hs-accent underline hover:text-hs-accent-hover"
      data-testid={`integration-settings-link-${integration}`}
    >
      {children}
    </a>
  );
}
