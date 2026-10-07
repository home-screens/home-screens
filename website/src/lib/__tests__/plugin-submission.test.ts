import { describe, it, expect } from 'vitest'

import {
  buildChecks,
  buildEntry,
  checksPass,
  impliedPermissions,
  normalizeSha256,
  parseRepoUrl,
  parseTags,
  submissionIssueUrl,
  submissionReadiness,
  validateSchema,
  type ManifestLike,
  type SubmissionFacts,
} from '../plugin-submission'

describe('parseRepoUrl', () => {
  it('accepts the shapes people paste', () => {
    const want = { owner: 'mara-dev', repo: 'home-screens-plugin-transit' }
    for (const input of [
      'https://github.com/mara-dev/home-screens-plugin-transit',
      'https://github.com/mara-dev/home-screens-plugin-transit/',
      'https://github.com/mara-dev/home-screens-plugin-transit.git',
      'https://github.com/mara-dev/home-screens-plugin-transit/tree/main/src',
      'github.com/mara-dev/home-screens-plugin-transit',
      'mara-dev/home-screens-plugin-transit',
      '  mara-dev/home-screens-plugin-transit  ',
    ]) {
      expect(parseRepoUrl(input), input).toEqual(want)
    }
  })
  it('rejects anything else', () => {
    expect(parseRepoUrl('https://gitlab.com/a/b')).toBeNull()
    expect(parseRepoUrl('not a repo')).toBeNull()
    expect(parseRepoUrl('')).toBeNull()
  })
})

const schema = {
  type: 'object',
  required: ['id', 'category', 'defaultSize'],
  additionalProperties: false,
  properties: {
    id: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]*[a-z0-9]$' },
    category: { $ref: '#/$defs/Category' },
    defaultSize: {
      type: 'object',
      required: ['w', 'h'],
      additionalProperties: false,
      properties: { w: { type: 'integer', minimum: 1 }, h: { type: 'integer', minimum: 1 } },
    },
    permissions: { type: 'array', items: { type: 'string', enum: ['network', 'secrets'] }, uniqueItems: true },
    auth: { oneOf: [{ type: 'object', properties: { type: { const: 'garmin' } }, required: ['type'] }, { type: 'null' }] },
  },
  $defs: { Category: { type: 'string', enum: ['Travel', 'Personal'] } },
}

describe('validateSchema', () => {
  it('passes a good manifest', () => {
    expect(
      validateSchema({ id: 'transit', category: 'Travel', defaultSize: { w: 2, h: 1 }, permissions: ['network'], auth: { type: 'garmin' } }, schema),
    ).toEqual([])
  })
  it('names each problem with its path', () => {
    const errors = validateSchema(
      { id: 'Bad_Id', category: 'Weather', defaultSize: { w: 0 }, permissions: ['network', 'network'], extra: 1, auth: { type: 'nope' } },
      schema,
    )
    expect(errors).toEqual([
      'manifest.id does not look right ("Bad_Id")',
      'manifest.category must be one of "Travel", "Personal"',
      'manifest.defaultSize is missing h',
      'manifest.defaultSize.w must be at least 1',
      'manifest.permissions has a repeated item',
      'manifest.auth does not match any of the allowed shapes',
      'manifest has an unknown field extra',
    ])
    expect(validateSchema('nope', schema)).toEqual(['manifest should be object, not string'])
  })
})

const manifest: ManifestLike = {
  id: 'transit-departures',
  name: 'Transit Departures',
  version: '1.0.0',
  description: 'Next departures from the stops you choose.',
  author: 'mara-dev',
  license: 'MIT',
  minAppVersion: '1.12.0',
  moduleType: 'transit-departures',
  category: 'Travel',
  icon: 'Train',
  permissions: ['network'],
  allowedDomains: ['api.example.com'],
}

function facts(overrides: Partial<SubmissionFacts> = {}): SubmissionFacts {
  return {
    repo: { owner: 'mara-dev', repo: 'home-screens-plugin-transit' },
    repoInfo: { license: 'MIT', defaultBranch: 'main', description: null, htmlUrl: 'https://github.com/mara-dev/home-screens-plugin-transit' },
    manifest,
    manifestErrors: [],
    release: {
      tag: 'v1.0.0',
      publishedAt: '2026-09-29T10:00:00Z',
      htmlUrl: 'https://github.com/mara-dev/home-screens-plugin-transit/releases/tag/v1.0.0',
      asset: { name: 'plugin.tar.gz', size: 188_416, url: 'https://github.com/mara-dev/home-screens-plugin-transit/releases/download/v1.0.0/plugin.tar.gz' },
    },
    listedIds: ['garmin', 'strava'],
    currentAppVersion: '1.13.0',
    sha256: '9f3a'.repeat(16),
    ...overrides,
  }
}

function statuses(f: SubmissionFacts) {
  return Object.fromEntries(buildChecks(f).map((row) => [row.key, row.status]))
}

describe('buildChecks', () => {
  it('passes a complete submission', () => {
    const rows = buildChecks(facts())
    expect(checksPass(rows)).toBe(true)
    expect(statuses(facts())).toEqual({
      manifest: 'ok', release: 'ok', sha256: 'ok', category: 'ok', minAppVersion: 'ok', permissions: 'ok', id: 'ok', license: 'ok',
    })
    expect(rows.find((r) => r.key === 'release')?.detail).toBe('Published Sep 29, 2026 · 184 KB')
  })

  it('stops at a missing repo', () => {
    const rows = buildChecks(facts({ repoInfo: null }))
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('bad')
  })

  it('flags the things the registry rejects', () => {
    expect(statuses(facts({ manifest: { ...manifest, category: 'Transit' } })).category).toBe('bad')
    expect(statuses(facts({ manifest: { ...manifest, minAppVersion: '0.15.0' } })).minAppVersion).toBe('bad')
    expect(statuses(facts({ manifest: { ...manifest, minAppVersion: '2.0.0' } })).minAppVersion).toBe('bad')
    expect(statuses(facts({ listedIds: ['transit-departures'] })).id).toBe('bad')
    expect(statuses(facts({ release: null })).release).toBe('bad')
    expect(statuses(facts({ release: { tag: 'v1.0.0', publishedAt: null, htmlUrl: '', asset: null } })).release).toBe('bad')
    expect(statuses(facts({ manifestErrors: ['manifest is missing icon'] })).manifest).toBe('bad')
    expect(statuses(facts({ manifest: null })).manifest).toBe('bad')
  })

  it('requires the hash before the entry can be sent', () => {
    expect(statuses(facts({ sha256: '' })).sha256).toBe('bad')
    expect(statuses(facts({ sha256: 'abc' })).sha256).toBe('bad')
    expect(statuses(facts({ sha256: `SHA256: ${'A1'.repeat(32)}  plugin.tar.gz` })).sha256).toBe('ok')
    expect(checksPass(buildChecks(facts({ sha256: '' })))).toBe(false)
    expect(submissionReadiness(buildChecks(facts({ sha256: '' })))).toBe('needs-hash')
    expect(submissionReadiness(buildChecks(facts({ sha256: 'abc' })))).toBe('needs-hash')
    expect(submissionReadiness(buildChecks(facts()))).toBe('ready')
    expect(submissionReadiness(buildChecks(facts({ sha256: '', listedIds: ['transit-departures'] })))).toBe('blocked')
    expect(submissionReadiness([])).toBe('blocked')
  })

  it('reads nothing else from a manifest that failed the schema', () => {
    // The shapes the schema would have rejected: a string where a list
    // belongs and a number where a version string belongs. Neither may throw.
    const broken = { ...manifest, permissions: 'network', minAppVersion: 1 } as unknown as ManifestLike
    const rows = buildChecks(facts({ manifest: broken, manifestErrors: ['manifest.permissions should be array, not string'] }))
    expect(rows.map((r) => r.key)).toEqual(['manifest', 'release', 'sha256', 'license'])
    expect(rows[0].status).toBe('bad')
    expect(rows[0].detail).toContain('should be array')
    expect(submissionReadiness(rows)).toBe('blocked')
    expect(buildEntry(facts({ manifest: broken, manifestErrors: ['x'] }), { description: '', tags: [] })).toBeNull()
  })

  it('warns, not fails, on a missing license or a tag that differs from the manifest', () => {
    expect(statuses(facts({ repoInfo: { license: null, defaultBranch: 'main', description: null, htmlUrl: '' } })).license).toBe('warn')
    expect(statuses(facts({ manifest: { ...manifest, version: '1.1.0' } })).release).toBe('warn')
  })

  it('requires the permissions the manifest itself implies', () => {
    expect(impliedPermissions({ ...manifest, secrets: [{ key: 'token' }], auth: { type: 'garmin' } })).toEqual(['network', 'secrets', 'oauth'])
    expect(statuses(facts({ manifest: { ...manifest, permissions: [] } })).permissions).toBe('bad')
    expect(statuses(facts({ manifest: { ...manifest, allowedDomains: [], permissions: [] } })).permissions).toBe('ok')
  })
})

describe('buildEntry', () => {
  it('builds a registry entry from the manifest, release and edits', () => {
    const entry = buildEntry(facts(), { description: '  Departures, live.  ', tags: parseTags('Transit, bus, Bus, train stops') })
    expect(entry).toEqual({
      id: 'transit-departures',
      name: 'Transit Departures',
      description: 'Departures, live.',
      author: 'mara-dev',
      repo: 'mara-dev/home-screens-plugin-transit',
      license: 'MIT',
      category: 'Travel',
      tags: ['transit', 'bus', 'train-stops'],
      icon: 'Train',
      verified: false,
      permissions: ['network'],
      versions: [
        {
          version: '1.0.0',
          minAppVersion: '1.12.0',
          releaseDate: '2026-09-29T10:00:00Z',
          downloadUrl: 'https://github.com/mara-dev/home-screens-plugin-transit/releases/download/v1.0.0/plugin.tar.gz',
          sha256: '9f3a'.repeat(16),
          changelog: 'Initial release',
        },
      ],
    })
    expect(buildEntry(facts({ release: null }), { description: '', tags: [] })).toBeNull()
  })

  it('opens the registry issue form with the entry filled in', () => {
    const entry = buildEntry(facts(), { description: '', tags: [] })!
    const url = new URL(submissionIssueUrl(entry))
    expect(url.origin + url.pathname).toBe('https://github.com/home-screens/home-screens-plugins/issues/new')
    expect(url.searchParams.get('template')).toBe('submit-plugin.yml')
    expect(url.searchParams.get('title')).toBe('Add Transit Departures v1.0.0')
    expect(url.searchParams.get('repo')).toBe('mara-dev/home-screens-plugin-transit')
    expect(JSON.parse(url.searchParams.get('entry')!)).toEqual(entry)
  })
})

describe('normalizeSha256', () => {
  it('takes the first word, lowercased, without a sha256: prefix', () => {
    expect(normalizeSha256(`${'AB'.repeat(32)}  plugin.tar.gz\n`)).toBe('ab'.repeat(32))
    expect(normalizeSha256('sha256:ff')).toBe('ff')
  })
})
