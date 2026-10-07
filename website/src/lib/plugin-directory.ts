import { compareSemver } from './semver'
import type {
  PluginPermission,
  RegistryPlugin,
  RegistryPluginVersion,
  RegistryScreenshot,
} from './plugin-registry-types'

/**
 * Pure rules for the plugin directory: what a registry entry means (which
 * version a card shows, when a plugin counts as new or beta) and how the
 * directory filters, counts and sorts. No fetching and no React here, so the
 * build-time loader and the browser-side filter share one set of rules.
 */

/** How long a plugin counts as "New" after its first release. */
export const NEW_WINDOW_DAYS = 30

export interface DirectoryPlugin {
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
  permissions: PluginPermission[]
  /** The plugin itself is on the beta channel (every version is a test build). */
  isBeta: boolean
  /** True for a stable plugin that also ships at least one beta version. */
  hasBeta: boolean
  latestStable: RegistryPluginVersion | null
  latestBeta: RegistryPluginVersion | null
  /** What a card shows: the latest stable, or the latest beta for a beta plugin. */
  shownVersion: RegistryPluginVersion | null
  /** Newest release date across every version, ISO. */
  updatedAt: string | null
  /** Oldest release date across every version, ISO. */
  firstListed: string | null
  isNew: boolean
  /** Every version, newest first by semver. */
  versions: RegistryPluginVersion[]
  screenshots: RegistryScreenshot[]
}

/** What the directory's browser-side filter needs: a plugin without its version list and pictures. */
export type DirectoryCard = Omit<DirectoryPlugin, 'versions' | 'screenshots'>

export function toDirectoryCard(plugin: DirectoryPlugin): DirectoryCard {
  const { versions: _versions, screenshots: _screenshots, ...card } = plugin
  return card
}

export function sortVersionsDesc(
  versions: readonly RegistryPluginVersion[],
): RegistryPluginVersion[] {
  return [...versions].sort((a, b) => compareSemver(b.version, a.version))
}

function newestFirst(versions: readonly RegistryPluginVersion[], beta: boolean) {
  const matching = versions.filter((v) => (v.channel === 'beta') === beta)
  return sortVersionsDesc(matching)[0] ?? null
}

function dateBounds(versions: readonly RegistryPluginVersion[]) {
  const dates = versions
    .map((v) => v.releaseDate)
    .filter((d): d is string => typeof d === 'string' && !Number.isNaN(Date.parse(d)))
    .sort((a, b) => Date.parse(a) - Date.parse(b))
  return { first: dates[0] ?? null, last: dates[dates.length - 1] ?? null }
}

export function derivePlugin(
  plugin: RegistryPlugin,
  now: Date,
  screenshots: RegistryScreenshot[] = plugin.screenshots ?? [],
): DirectoryPlugin {
  const isBeta = plugin.channel === 'beta'
  const latestStable = isBeta ? null : newestFirst(plugin.versions, false)
  const latestBeta = isBeta
    ? sortVersionsDesc(plugin.versions)[0] ?? null
    : newestFirst(plugin.versions, true)
  const { first, last } = dateBounds(plugin.versions)
  const isNew =
    first !== null && now.getTime() - Date.parse(first) <= NEW_WINDOW_DAYS * 86_400_000

  return {
    id: plugin.id,
    name: plugin.name,
    description: plugin.description,
    author: plugin.author,
    repo: plugin.repo,
    license: plugin.license,
    category: plugin.category,
    tags: plugin.tags ?? [],
    icon: plugin.icon,
    verified: plugin.verified === true,
    permissions: plugin.permissions ?? [],
    isBeta,
    hasBeta: !isBeta && latestBeta !== null,
    latestStable,
    latestBeta,
    shownVersion: latestStable ?? latestBeta,
    updatedAt: last,
    firstListed: first,
    isNew,
    versions: sortVersionsDesc(plugin.versions),
    screenshots,
  }
}

// ---------------------------------------------------------------------------
// Filtering, counting, sorting

export type DirectorySort = 'updated' | 'newest' | 'name'

export const DIRECTORY_SORTS: ReadonlyArray<{ value: DirectorySort; label: string }> = [
  { value: 'updated', label: 'Recently updated' },
  { value: 'newest', label: 'Newest' },
  { value: 'name', label: 'Name' },
]

export interface DirectoryState {
  q: string
  category: string | null
  verified: boolean
  beta: boolean
  sort: DirectorySort
}

export const DEFAULT_DIRECTORY_STATE: DirectoryState = {
  q: '',
  category: null,
  verified: false,
  beta: false,
  sort: 'updated',
}

export function searchTerms(q: string): string[] {
  return q.toLowerCase().split(/\s+/).filter(Boolean)
}

/** Case-insensitive substring match; every term must hit somewhere. */
export function matchesSearch(plugin: DirectoryCard, terms: readonly string[]): boolean {
  if (terms.length === 0) return true
  const haystack = [
    plugin.name,
    plugin.description,
    plugin.author,
    plugin.category,
    ...plugin.tags,
  ]
    .join('\n')
    .toLowerCase()
  return terms.every((term) => haystack.includes(term))
}

/** The verified and beta toggles, without the search term or category. */
export function passesToggles(
  plugin: DirectoryCard,
  state: Pick<DirectoryState, 'verified' | 'beta'>,
): boolean {
  if (state.verified && !plugin.verified) return false
  if (!state.beta && plugin.isBeta) return false
  return true
}

export function filterPlugins<T extends DirectoryCard>(
  plugins: readonly T[],
  state: DirectoryState,
): T[] {
  const terms = searchTerms(state.q)
  return plugins.filter(
    (plugin) =>
      passesToggles(plugin, state) &&
      (state.category === null || plugin.category === state.category) &&
      matchesSearch(plugin, terms),
  )
}

/**
 * Per-category counts for the chips. They respect the toggles but not the
 * search term, so the chips never all drop to zero while someone types.
 * Categories with no plugin at all are left out.
 */
export function categoryCounts(
  plugins: readonly DirectoryCard[],
  state: Pick<DirectoryState, 'verified' | 'beta'>,
  categoryOrder: readonly string[],
): Array<{ category: string; count: number }> {
  const present = new Set(plugins.map((p) => p.category))
  const ordered = [
    ...categoryOrder.filter((c) => present.has(c)),
    ...[...present].filter((c) => !categoryOrder.includes(c)).sort(),
  ]
  return ordered.map((category) => ({
    category,
    count: plugins.filter((p) => p.category === category && passesToggles(p, state)).length,
  }))
}

function time(iso: string | null): number {
  return iso ? Date.parse(iso) : 0
}

export function sortPlugins<T extends DirectoryCard>(
  plugins: readonly T[],
  sort: DirectorySort,
): T[] {
  const byName = (a: DirectoryCard, b: DirectoryCard) =>
    a.name.localeCompare(b.name, 'en', { sensitivity: 'base' })
  const copy = [...plugins]
  switch (sort) {
    case 'name':
      return copy.sort(byName)
    case 'newest':
      return copy.sort((a, b) => time(b.firstListed) - time(a.firstListed) || byName(a, b))
    case 'updated':
    default:
      return copy.sort((a, b) => time(b.updatedAt) - time(a.updatedAt) || byName(a, b))
  }
}

/** The line under the chips. */
export function countLine(
  shown: readonly DirectoryCard[],
  state: DirectoryState,
): { lead: string; rest: string } {
  const n = shown.length
  const noun = n === 1 ? 'plugin' : 'plugins'
  const q = state.q.trim()
  if (q) {
    return { lead: `${n} ${noun}`, rest: ` match “${q}”` }
  }
  const verified = shown.filter((p) => p.verified).length
  const beta = shown.filter((p) => p.isBeta).length
  const parts: string[] = []
  if (verified) parts.push(`${verified} verified by the Home Screens team`)
  if (beta) parts.push(`${beta} beta`)
  return { lead: `${n} ${noun}`, rest: parts.map((p) => ` · ${p}`).join('') }
}

// ---------------------------------------------------------------------------
// URL state: ?q=&category=&verified=1&beta=1&sort=

export function parseDirectoryState(
  params: URLSearchParams,
  categories: readonly string[],
): DirectoryState {
  const category = params.get('category')
  const sort = params.get('sort')
  return {
    q: params.get('q') ?? '',
    category: category && categories.includes(category) ? category : null,
    verified: params.get('verified') === '1',
    beta: params.get('beta') === '1',
    sort: DIRECTORY_SORTS.some((s) => s.value === sort) ? (sort as DirectorySort) : 'updated',
  }
}

/** Only non-default values are written, so a clean directory has a clean URL. */
export function serializeDirectoryState(state: DirectoryState): string {
  const params = new URLSearchParams()
  if (state.q.trim()) params.set('q', state.q.trim())
  if (state.category) params.set('category', state.category)
  if (state.verified) params.set('verified', '1')
  if (state.beta) params.set('beta', '1')
  if (state.sort !== 'updated') params.set('sort', state.sort)
  const s = params.toString()
  return s ? `?${s}` : ''
}

// ---------------------------------------------------------------------------
// Dates and links

export function formatShortDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

export function formatLongDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export function repoUrl(repo: string): string {
  return `https://github.com/${repo}`
}

export function repoIssuesUrl(repo: string): string {
  return `https://github.com/${repo}/issues`
}

/** The repo's own name, without the owner. */
export function repoName(repo: string): string {
  return repo.split('/')[1] ?? repo
}
