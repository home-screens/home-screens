import { createJsonStore } from './json-store';

export type SecretKey =
  | 'openweathermap_key'
  | 'weatherapi_key'
  | 'pirateweather_key'
  | 'metoffice_key'
  | 'unsplash_access_key'
  | 'todoist_token'
  | 'google_maps_key'
  | 'tomtom_key'
  | 'google_client_id'
  | 'google_client_secret'
  | 'google_web_client_id'
  | 'google_web_client_secret'
  | 'immich_url'
  | 'immich_api_key'
  | 'mealie_url'
  | 'mealie_api_key'
  | 'microsoft_client_id';

type SecretsStore = Partial<Record<SecretKey, string>>;

const ALL_KEYS: SecretKey[] = [
  'openweathermap_key',
  'weatherapi_key',
  'pirateweather_key',
  'metoffice_key',
  'unsplash_access_key',
  'todoist_token',
  'google_maps_key',
  'tomtom_key',
  'google_client_id',
  'google_client_secret',
  'google_web_client_id',
  'google_web_client_secret',
  'immich_url',
  'immich_api_key',
  'mealie_url',
  'mealie_api_key',
  'microsoft_client_id',
];

export function isValidSecretKey(key: string): key is SecretKey {
  return ALL_KEYS.includes(key as SecretKey);
}

const store = createJsonStore<SecretsStore>({
  path: 'data/secrets.json',
  defaultValue: {},
  chmod: 0o600,
  errorHandling: 'throw-corrupt',
});

export const readSecrets = store.read;
export const writeSecrets = store.write;

export async function getSecret(key: SecretKey): Promise<string | null> {
  const secrets = await readSecrets();
  return secrets[key] || null;
}

type SecretChangeListener = (value: string | null) => void;
const changeListeners = new Map<SecretKey, Set<SecretChangeListener>>();

/**
 * Runs after `setSecret` or `deleteSecret` lands a different value for
 * `key`, with the new value (`null` once deleted). A route that caches what
 * a key fetched (the Todoist task list) empties its cache here, so a new
 * account's data shows at once instead of after the old entry expires.
 * Returns the unsubscribe.
 */
export function onSecretChange(key: SecretKey, listener: SecretChangeListener): () => void {
  let listeners = changeListeners.get(key);
  if (!listeners) {
    listeners = new Set();
    changeListeners.set(key, listeners);
  }
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function notifyChange(key: SecretKey, value: string | null): void {
  for (const listener of changeListeners.get(key) ?? []) listener(value);
}

export async function setSecret(key: SecretKey, value: string): Promise<void> {
  const secrets = await readSecrets();
  const changed = secrets[key] !== value;
  secrets[key] = value;
  await writeSecrets(secrets);
  if (changed) notifyChange(key, value);
}

export async function deleteSecret(key: SecretKey): Promise<void> {
  const secrets = await readSecrets();
  const changed = key in secrets;
  delete secrets[key];
  await writeSecrets(secrets);
  if (changed) notifyChange(key, null);
}

export async function getSecretStatus(): Promise<Record<SecretKey, boolean>> {
  const secrets = await readSecrets();
  const status = {} as Record<SecretKey, boolean>;
  for (const key of ALL_KEYS) {
    status[key] = Boolean(secrets[key]);
  }
  return status;
}
