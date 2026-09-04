import type { SecretKey } from '@/components/editor/settings/shared/SecretField';
import { weatherProviderName } from '@/lib/weather-provider-names';

/**
 * Every outside service a household can connect, and the secrets that count
 * as connecting it.
 *
 * One list, two readers. The API keys page and the Status page each used to
 * carry their own idea of what an "integration" was, and the two disagreed on
 * screen: the API keys header said "0 of 7" (or "0 of 8" once advanced mode
 * revealed GitHub) while Status said "0 / 10 configured" over a different set
 * of names. Neither number was wrong for its own list; they were just two
 * lists. Both now derive from here, so the names, the grouping and the
 * connected/not state cannot drift apart again.
 *
 * `keys` is the whole set that belongs to the service; `requiredKeys` is the
 * subset that has to be present for it to count as connected, which is how
 * Google's optional Photos-import credential avoids demoting a working
 * Calendar setup to "partly set up".
 */
export interface ConnectableService {
  id: string;
  /** Brand name, deliberately untranslated. Weather rows take theirs from
   *  `weatherProviderName` so the Weather page and this one cannot disagree. */
  label: string;
  /** Two-letter badge used by the Status page's grid. */
  initials: string;
  /** Which settings page configures it. */
  page: 'integrations' | 'weather';
  keys: SecretKey[];
  /** Defaults to `keys` when a service has no optional extras. */
  requiredKeys?: SecretKey[];
  /** Hidden until "Show advanced options" is on. */
  advancedOnly?: boolean;
}

export const CONNECTABLE_SERVICES: ConnectableService[] = [
  {
    id: 'google',
    label: 'Google',
    initials: 'GO',
    page: 'integrations',
    keys: [
      'google_client_id',
      'google_client_secret',
      'google_web_client_id',
      'google_web_client_secret',
      'google_maps_key',
    ],
    // The Photos-import web client is optional, and Maps is only needed for
    // the traffic module, so neither gates "connected".
    requiredKeys: ['google_client_id', 'google_client_secret'],
  },
  { id: 'immich', label: 'Immich', initials: 'IM', page: 'integrations', keys: ['immich_url', 'immich_api_key'] },
  { id: 'microsoft', label: 'Microsoft', initials: 'MS', page: 'integrations', keys: ['microsoft_client_id'] },
  { id: 'unsplash', label: 'Unsplash', initials: 'UN', page: 'integrations', keys: ['unsplash_access_key'] },
  { id: 'nasa', label: 'NASA', initials: 'NA', page: 'integrations', keys: ['nasa_api_key'] },
  { id: 'todoist', label: 'Todoist', initials: 'TD', page: 'integrations', keys: ['todoist_token'] },
  { id: 'tomtom', label: 'TomTom', initials: 'TT', page: 'integrations', keys: ['tomtom_key'] },
  { id: 'github', label: 'GitHub', initials: 'GH', page: 'integrations', keys: ['github_token'], advancedOnly: true },
  { id: 'openweathermap', label: weatherProviderName('openweathermap'), initials: 'OW', page: 'weather', keys: ['openweathermap_key'] },
  { id: 'weatherapi', label: weatherProviderName('weatherapi'), initials: 'WA', page: 'weather', keys: ['weatherapi_key'] },
  { id: 'pirateweather', label: weatherProviderName('pirateweather'), initials: 'PW', page: 'weather', keys: ['pirateweather_key'] },
  { id: 'metoffice', label: weatherProviderName('metoffice'), initials: 'MO', page: 'weather', keys: ['metoffice_key'] },
];

/** The keys that decide whether a service counts as connected. */
export function requiredKeysOf(service: ConnectableService): SecretKey[] {
  return service.requiredKeys ?? service.keys;
}

/** Services shown on a given settings page, honouring the advanced-mode gate. */
export function servicesForPage(
  page: ConnectableService['page'],
  advancedMode: boolean,
): ConnectableService[] {
  return CONNECTABLE_SERVICES.filter(
    (s) => s.page === page && (advancedMode || !s.advancedOnly),
  );
}

/** True when every key the service needs is present in the configured set. */
export function isServiceConnected(
  service: ConnectableService,
  configuredKeys: Iterable<string>,
): boolean {
  const configured = new Set(configuredKeys);
  return requiredKeysOf(service).every((k) => configured.has(k));
}
