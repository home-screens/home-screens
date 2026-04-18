import { createJsonStore } from './json-store';

export type SecretKey =
  | 'openweathermap_key'
  | 'weatherapi_key'
  | 'pirateweather_key'
  | 'unsplash_access_key'
  | 'nasa_api_key'
  | 'todoist_token'
  | 'google_maps_key'
  | 'tomtom_key'
  | 'google_client_id'
  | 'google_client_secret'
  | 'github_token'
  | 'immich_url'
  | 'immich_api_key';

type SecretsStore = Partial<Record<SecretKey, string>>;

const ALL_KEYS: SecretKey[] = [
  'openweathermap_key',
  'weatherapi_key',
  'pirateweather_key',
  'unsplash_access_key',
  'nasa_api_key',
  'todoist_token',
  'google_maps_key',
  'tomtom_key',
  'google_client_id',
  'google_client_secret',
  'github_token',
  'immich_url',
  'immich_api_key',
];

export function isValidSecretKey(key: string): key is SecretKey {
  return ALL_KEYS.includes(key as SecretKey);
}

const store = createJsonStore<SecretsStore>({
  path: 'data/secrets.json',
  defaultValue: {},
  chmod: 0o600,
});

export const readSecrets = store.read;
export const writeSecrets = store.write;

export async function getSecret(key: SecretKey): Promise<string | null> {
  const secrets = await readSecrets();
  return secrets[key] || null;
}

export async function setSecret(key: SecretKey, value: string): Promise<void> {
  const secrets = await readSecrets();
  secrets[key] = value;
  await writeSecrets(secrets);
}

export async function deleteSecret(key: SecretKey): Promise<void> {
  const secrets = await readSecrets();
  delete secrets[key];
  await writeSecrets(secrets);
}

export async function getSecretStatus(): Promise<Record<SecretKey, boolean>> {
  const secrets = await readSecrets();
  const status = {} as Record<SecretKey, boolean>;
  for (const key of ALL_KEYS) {
    status[key] = Boolean(secrets[key]);
  }
  return status;
}
