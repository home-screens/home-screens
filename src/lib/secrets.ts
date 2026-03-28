import { promises as fs } from 'fs';
import path from 'path';

function getSecretsPath(): string {
  return path.join(process.cwd(), 'data', 'secrets.json');
}

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
  | 'github_token';

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
];

export function isValidSecretKey(key: string): key is SecretKey {
  return ALL_KEYS.includes(key as SecretKey);
}

export async function readSecrets(): Promise<SecretsStore> {
  try {
    const secretsPath = getSecretsPath();
    const data = await fs.readFile(secretsPath, 'utf-8');
    return JSON.parse(data) as SecretsStore;
  } catch {
    return {};
  }
}

export async function writeSecrets(store: SecretsStore): Promise<void> {
  const secretsPath = getSecretsPath();
  await fs.mkdir(path.dirname(secretsPath), { recursive: true });
  const tmp = secretsPath + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(store, null, 2), 'utf-8');
  await fs.chmod(tmp, 0o600);
  await fs.rename(tmp, secretsPath);
}

export async function getSecret(key: SecretKey): Promise<string | null> {
  const store = await readSecrets();
  return store[key] || null;
}

export async function setSecret(key: SecretKey, value: string): Promise<void> {
  const store = await readSecrets();
  store[key] = value;
  await writeSecrets(store);
}

export async function deleteSecret(key: SecretKey): Promise<void> {
  const store = await readSecrets();
  delete store[key];
  await writeSecrets(store);
}

export async function getSecretStatus(): Promise<Record<SecretKey, boolean>> {
  const store = await readSecrets();
  const status = {} as Record<SecretKey, boolean>;
  for (const key of ALL_KEYS) {
    status[key] = Boolean(store[key]);
  }
  return status;
}
