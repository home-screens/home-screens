/**
 * The shape of `plugins.json` in home-screens/home-screens-plugins, copied
 * from the app's `src/types/plugins.ts`. The website is a separate Next app
 * and does not import from the app's source, so the registry contract lives
 * here a second time; keep the two in step when the registry schema changes.
 */

export type PluginPermission =
  | 'network'
  | 'localNetwork'
  | 'secrets'
  | 'events'
  | 'storage'
  | 'oauth'

export const PLUGIN_PERMISSIONS: readonly PluginPermission[] = [
  'network',
  'localNetwork',
  'secrets',
  'events',
  'storage',
  'oauth',
]

/** The eight categories the registry schema allows, in the editor's order. */
export const PLUGIN_CATEGORIES = [
  'Time & Date',
  'Weather & Environment',
  'News & Finance',
  'Knowledge & Fun',
  'Personal',
  'Health & Fitness',
  'Media & Display',
  'Travel',
] as const

export type PluginCategory = (typeof PLUGIN_CATEGORIES)[number]

export type PluginChannel = 'stable' | 'beta'

export interface RegistryPluginVersion {
  version: string
  minAppVersion: string
  maxAppVersion?: string
  /** Per-version channel; absent means stable. */
  channel?: PluginChannel
  releaseDate?: string
  downloadUrl: string
  sha256: string
  changelog?: string
}

export interface RegistryScreenshot {
  src: string
  caption?: string
}

export interface RegistryPlugin {
  id: string
  name: string
  description: string
  author: string
  repo: string
  license: string
  category: string
  tags: string[]
  icon: string
  verified: boolean
  /** Plugin-level channel; 'beta' hides it from Browse unless opted in. */
  channel?: PluginChannel
  permissions?: PluginPermission[]
  /** Optional pictures an author lists on the registry entry. */
  screenshots?: RegistryScreenshot[]
  versions: RegistryPluginVersion[]
}

export interface PluginRegistry {
  schemaVersion: number
  lastUpdated: string
  plugins: RegistryPlugin[]
}

export const REGISTRY_REPO = 'home-screens/home-screens-plugins'

export const DEFAULT_REGISTRY_URL = `https://raw.githubusercontent.com/${REGISTRY_REPO}/main/plugins.json`
