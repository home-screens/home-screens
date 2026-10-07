// Runs under the repo root's vitest, like hub-return.test.ts.
import { describe, it, expect } from 'vitest'

import {
  categoryCounts,
  countLine,
  derivePlugin,
  filterPlugins,
  parseDirectoryState,
  serializeDirectoryState,
  sortPlugins,
  toDirectoryCard,
  type DirectoryState,
} from '../plugin-directory'
import { PLUGIN_CATEGORIES, type RegistryPlugin } from '../plugin-registry-types'

const NOW = new Date('2026-10-06T12:00:00Z')

function version(v: string, date: string, channel?: 'beta') {
  return {
    version: v,
    minAppVersion: '1.0.0',
    releaseDate: date,
    downloadUrl: `https://example.com/${v}/plugin.tar.gz`,
    sha256: 'a'.repeat(64),
    ...(channel ? { channel } : {}),
  }
}

function plugin(overrides: Partial<RegistryPlugin>): RegistryPlugin {
  return {
    id: 'thing',
    name: 'Thing',
    description: 'Shows a thing.',
    author: 'someone',
    repo: 'someone/home-screens-plugin-thing',
    license: 'MIT',
    category: 'Personal',
    tags: [],
    icon: 'Puzzle',
    verified: false,
    versions: [version('1.0.0', '2026-01-01T00:00:00Z')],
    ...overrides,
  }
}

describe('derivePlugin', () => {
  it('picks the latest stable by semver, not array order, and keeps betas apart', () => {
    const p = derivePlugin(
      plugin({
        versions: [
          version('1.2.0', '2026-03-01T00:00:00Z'),
          version('1.10.0', '2026-05-01T00:00:00Z'),
          version('1.11.0-beta.1', '2026-06-01T00:00:00Z', 'beta'),
          version('1.9.0', '2026-04-01T00:00:00Z'),
        ],
      }),
      NOW,
    )
    expect(p.latestStable?.version).toBe('1.10.0')
    expect(p.latestBeta?.version).toBe('1.11.0-beta.1')
    expect(p.shownVersion?.version).toBe('1.10.0')
    expect(p.hasBeta).toBe(true)
    expect(p.isBeta).toBe(false)
    expect(p.versions.map((v) => v.version)).toEqual(['1.11.0-beta.1', '1.10.0', '1.9.0', '1.2.0'])
    expect(p.updatedAt).toBe('2026-06-01T00:00:00Z')
    expect(p.firstListed).toBe('2026-03-01T00:00:00Z')
  })

  it('shows the latest beta for a beta-channel plugin', () => {
    const p = derivePlugin(
      plugin({ channel: 'beta', versions: [version('0.2.0-beta.1', '2026-09-20T00:00:00Z', 'beta')] }),
      NOW,
    )
    expect(p.isBeta).toBe(true)
    expect(p.latestStable).toBeNull()
    expect(p.shownVersion?.version).toBe('0.2.0-beta.1')
    expect(p.hasBeta).toBe(false)
  })

  it('counts a plugin as new for 30 days after its first release', () => {
    const fresh = derivePlugin(plugin({ versions: [version('1.0.0', '2026-09-10T00:00:00Z')] }), NOW)
    const old = derivePlugin(plugin({ versions: [version('1.0.0', '2026-08-01T00:00:00Z'), version('1.1.0', '2026-10-01T00:00:00Z')] }), NOW)
    expect(fresh.isNew).toBe(true)
    expect(old.isNew).toBe(false)
  })

  it('prefers registry screenshots over the website folder', () => {
    const shots = [{ src: 'https://example.com/a.png', caption: 'A' }]
    expect(derivePlugin(plugin({ screenshots: shots }), NOW).screenshots).toEqual(shots)
    expect(derivePlugin(plugin({}), NOW, [{ src: '/images/x.webp' }]).screenshots).toEqual([{ src: '/images/x.webp' }])
  })
})

const cards = [
  plugin({ id: 'ha', name: 'Home Assistant', category: 'Personal', tags: ['smart-home', 'lights'], versions: [version('1.9.0', '2026-09-24T00:00:00Z'), version('1.0.0', '2026-04-19T00:00:00Z')] }),
  plugin({ id: 'garmin', name: 'Garmin', category: 'Health & Fitness', verified: true, tags: ['fitness'], versions: [version('1.5.0', '2026-07-28T00:00:00Z'), version('1.1.0', '2026-07-12T00:00:00Z')] }),
  plugin({ id: 'strava', name: 'Strava', author: 'mara', category: 'Health & Fitness', verified: true, tags: ['fitness', 'running'], versions: [version('1.4.0', '2026-07-28T00:00:00Z')] }),
  plugin({ id: 'now-playing', name: 'Now Playing', category: 'Media & Display', channel: 'beta', versions: [version('0.3.0-beta.2', '2026-09-18T00:00:00Z', 'beta')] }),
].map((p) => toDirectoryCard(derivePlugin(p, NOW)))

const base: DirectoryState = { q: '', category: null, verified: false, beta: false, sort: 'updated' }

describe('filterPlugins', () => {
  it('hides beta plugins until the toggle is on', () => {
    expect(filterPlugins(cards, base).map((p) => p.id)).toEqual(['ha', 'garmin', 'strava'])
    expect(filterPlugins(cards, { ...base, beta: true }).map((p) => p.id)).toContain('now-playing')
  })

  it('matches every term across name, tags, author and category, case-insensitively', () => {
    expect(filterPlugins(cards, { ...base, q: 'FIT' }).map((p) => p.id)).toEqual(['garmin', 'strava'])
    expect(filterPlugins(cards, { ...base, q: 'fitness mara' }).map((p) => p.id)).toEqual(['strava'])
    expect(filterPlugins(cards, { ...base, q: 'smart home' }).map((p) => p.id)).toEqual(['ha'])
    expect(filterPlugins(cards, { ...base, q: 'smart-home' }).map((p) => p.id)).toEqual(['ha'])
    expect(filterPlugins(cards, { ...base, q: 'health' }).map((p) => p.id)).toEqual(['garmin', 'strava'])
  })

  it('combines the category with the verified toggle', () => {
    expect(filterPlugins(cards, { ...base, category: 'Health & Fitness', verified: true }).map((p) => p.id)).toEqual(['garmin', 'strava'])
    expect(filterPlugins(cards, { ...base, category: 'Personal', verified: true })).toEqual([])
  })
})

describe('categoryCounts', () => {
  it('follows the registry order, respects the toggles and ignores the search term', () => {
    expect(categoryCounts(cards, base, PLUGIN_CATEGORIES)).toEqual([
      { category: 'Personal', count: 1 },
      { category: 'Health & Fitness', count: 2 },
      { category: 'Media & Display', count: 0 },
    ])
    expect(categoryCounts(cards, { verified: false, beta: true }, PLUGIN_CATEGORIES)[2]).toEqual({ category: 'Media & Display', count: 1 })
  })
})

describe('sortPlugins', () => {
  it('sorts by last release, first release, or name', () => {
    const shown = filterPlugins(cards, { ...base, beta: true })
    expect(sortPlugins(shown, 'updated').map((p) => p.id)).toEqual(['ha', 'now-playing', 'garmin', 'strava'])
    expect(sortPlugins(shown, 'newest').map((p) => p.id)).toEqual(['now-playing', 'strava', 'garmin', 'ha'])
    expect(sortPlugins(shown, 'name').map((p) => p.id)).toEqual(['garmin', 'ha', 'now-playing', 'strava'])
  })
})

describe('countLine', () => {
  it('describes the whole directory or a search', () => {
    expect(countLine(filterPlugins(cards, { ...base, beta: true }), { ...base, beta: true })).toEqual({
      lead: '4 plugins',
      rest: ' · 2 verified by the Home Screens team · 1 beta',
    })
    expect(countLine(filterPlugins(cards, { ...base, q: 'fit' }), { ...base, q: 'fit' })).toEqual({
      lead: '2 plugins',
      rest: ' match “fit”',
    })
    expect(countLine([], { ...base, q: 'x' }).lead).toBe('0 plugins')
  })
})

describe('URL state', () => {
  it('round-trips and ignores unknown values', () => {
    const state: DirectoryState = { q: 'smart home', category: 'Health & Fitness', verified: true, beta: true, sort: 'name' }
    const query = serializeDirectoryState(state)
    expect(parseDirectoryState(new URLSearchParams(query), PLUGIN_CATEGORIES)).toEqual(state)
    expect(serializeDirectoryState(base)).toBe('')
    expect(parseDirectoryState(new URLSearchParams('?category=Nope&sort=random'), PLUGIN_CATEGORIES)).toEqual(base)
  })
})
