import { compareSemver } from './semver'
import {
  PLUGIN_CATEGORIES,
  PLUGIN_PERMISSIONS,
  REGISTRY_REPO,
  type PluginPermission,
  type RegistryPlugin,
} from './plugin-registry-types'
import { SUBMISSION_ISSUE_TEMPLATE } from './plugin-links'

/**
 * The rules behind /plugins/submit, kept free of fetching and React so the
 * same checks can run in a browser today and in a worker later. The page
 * gathers what GitHub says about a repo and hands it in; this module says
 * what is wrong with it and what the registry entry should be.
 */

/** The first app release with plugin support; the registry refuses anything older. */
export const MIN_SUPPORTED_APP_VERSION = '0.16.0'

export const TARBALL_NAME = 'plugin.tar.gz'

export interface RepoRef {
  owner: string
  repo: string
}

/** Accepts a GitHub URL (with or without .git, a trailing slash or a tree path) or a bare owner/repo. */
export function parseRepoUrl(input: string): RepoRef | null {
  const trimmed = input.trim()
  const match =
    trimmed.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)\/([A-Za-z0-9_.-]+?)(?:\.git)?(?:[/#?].*)?$/) ??
    trimmed.match(/^([A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/)
  if (!match) return null
  return { owner: match[1], repo: match[2] }
}

// ---------------------------------------------------------------------------
// A small JSON Schema reader, enough for the registry's manifest schema.
// Pulling in a full validator would be a sixth of the page's script for a
// form that runs a few times a month.

export interface JsonSchema {
  type?: string | string[]
  required?: string[]
  properties?: Record<string, JsonSchema>
  additionalProperties?: boolean | JsonSchema
  items?: JsonSchema
  enum?: unknown[]
  const?: unknown
  pattern?: string
  minimum?: number
  minItems?: number
  uniqueItems?: boolean
  oneOf?: JsonSchema[]
  $ref?: string
  $defs?: Record<string, JsonSchema>
  format?: string
}

function typeOf(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number'
  return typeof value
}

function typeMatches(expected: string, actual: string): boolean {
  return expected === actual || (expected === 'number' && actual === 'integer')
}

function resolveRef(ref: string, root: JsonSchema): JsonSchema {
  const parts = ref.replace(/^#\//, '').split('/')
  let node: unknown = root
  for (const part of parts) node = (node as Record<string, unknown> | undefined)?.[part]
  if (!node) throw new Error(`Unknown schema reference ${ref}`)
  return node as JsonSchema
}

export function validateSchema(
  value: unknown,
  schema: JsonSchema,
  root: JsonSchema = schema,
  path = '',
): string[] {
  if (schema.$ref) return validateSchema(value, resolveRef(schema.$ref, root), root, path)
  const at = path || 'manifest'
  const errors: string[] = []
  const actual = typeOf(value)

  if (schema.type) {
    const allowed = Array.isArray(schema.type) ? schema.type : [schema.type]
    if (!allowed.some((t) => typeMatches(t, actual))) {
      return [`${at} should be ${allowed.join(' or ')}, not ${actual}`]
    }
  }
  if (schema.const !== undefined && value !== schema.const) {
    errors.push(`${at} must be ${JSON.stringify(schema.const)}`)
  }
  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${at} must be one of ${schema.enum.map((v) => JSON.stringify(v)).join(', ')}`)
  }
  if (schema.pattern && typeof value === 'string' && !new RegExp(schema.pattern).test(value)) {
    errors.push(`${at} does not look right (${JSON.stringify(value)})`)
  }
  if (schema.minimum !== undefined && typeof value === 'number' && value < schema.minimum) {
    errors.push(`${at} must be at least ${schema.minimum}`)
  }
  if (schema.oneOf) {
    const passing = schema.oneOf.filter((option) => validateSchema(value, option, root, path).length === 0)
    if (passing.length !== 1) errors.push(`${at} does not match any of the allowed shapes`)
  }
  if (actual === 'array' && Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push(`${at} needs at least ${schema.minItems} item${schema.minItems === 1 ? '' : 's'}`)
    }
    if (schema.uniqueItems && new Set(value.map((v) => JSON.stringify(v))).size !== value.length) {
      errors.push(`${at} has a repeated item`)
    }
    if (schema.items) {
      value.forEach((item, i) => errors.push(...validateSchema(item, schema.items!, root, `${at}[${i}]`)))
    }
  }
  if (actual === 'object' && value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    for (const key of schema.required ?? []) {
      if (record[key] === undefined) errors.push(`${at} is missing ${key}`)
    }
    for (const [key, child] of Object.entries(schema.properties ?? {})) {
      if (record[key] !== undefined) errors.push(...validateSchema(record[key], child, root, `${at}.${key}`))
    }
    if (schema.additionalProperties !== undefined && schema.additionalProperties !== true) {
      for (const key of Object.keys(record)) {
        if (schema.properties && key in schema.properties) continue
        if (schema.additionalProperties === false) errors.push(`${at} has an unknown field ${key}`)
        else errors.push(...validateSchema(record[key], schema.additionalProperties, root, `${at}.${key}`))
      }
    }
  }
  return errors
}

// ---------------------------------------------------------------------------
// What the page learns about a repo

export interface RepoInfo {
  /** SPDX id GitHub detected, or null when the repo has no license file. */
  license: string | null
  defaultBranch: string
  description: string | null
  htmlUrl: string
}

export interface ReleaseInfo {
  tag: string
  publishedAt: string | null
  htmlUrl: string
  asset: { name: string; size: number; url: string } | null
}

/** The manifest fields the checks read; everything else is passed through the schema. */
export interface ManifestLike {
  id?: string
  name?: string
  version?: string
  description?: string
  author?: string
  license?: string
  minAppVersion?: string
  moduleType?: string
  category?: string
  icon?: string
  permissions?: string[]
  secrets?: unknown[]
  allowedDomains?: string[]
  auth?: unknown
}

export interface SubmissionFacts {
  repo: RepoRef
  repoInfo: RepoInfo | null
  manifest: ManifestLike | null
  /** Why the manifest did not load or validate; empty when it did. */
  manifestErrors: string[]
  release: ReleaseInfo | null
  /** Ids already in the registry. */
  listedIds: string[]
  /** The newest Home Screens release, so a manifest cannot ask for a version nobody has. */
  currentAppVersion: string
  /** What the author pasted. */
  sha256: string
}

export type CheckStatus = 'ok' | 'warn' | 'bad'

export interface CheckRow {
  key: string
  status: CheckStatus
  title: string
  detail: string
}

export const SHA256_RE = /^[a-f0-9]{64}$/

export function normalizeSha256(input: string): string {
  return input.trim().toLowerCase().replace(/^sha256[:\s]+/, '').split(/\s+/)[0] ?? ''
}

function versionOfTag(tag: string): string {
  return tag.replace(/^v/i, '')
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

function nonEmptyArray(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0
}

/** What a manifest implies about permissions, from its own declarations. */
export function impliedPermissions(manifest: ManifestLike): PluginPermission[] {
  const implied: PluginPermission[] = []
  if (nonEmptyArray(manifest.allowedDomains)) implied.push('network')
  if (nonEmptyArray(manifest.secrets)) implied.push('secrets')
  if (manifest.auth && typeof manifest.auth === 'object') implied.push('oauth', 'network')
  return [...new Set(implied)]
}

function declaredPermissions(manifest: ManifestLike): PluginPermission[] {
  if (!Array.isArray(manifest.permissions)) return []
  return manifest.permissions.filter((p): p is PluginPermission =>
    (PLUGIN_PERMISSIONS as readonly string[]).includes(p),
  )
}

export function buildChecks(facts: SubmissionFacts): CheckRow[] {
  const rows: CheckRow[] = []
  const { release } = facts
  // A manifest that failed the schema is not read any further: its fields
  // may be the wrong shape (a string where a list belongs), and every check
  // below trusts the shape the schema promised.
  const manifest = facts.manifestErrors.length === 0 ? facts.manifest : null

  // Manifest
  if (!facts.repoInfo) {
    rows.push({
      key: 'repo',
      status: 'bad',
      title: 'Repo not found',
      detail: `GitHub has no public repo at ${facts.repo.owner}/${facts.repo.repo}. Check the link, and make sure the repo is public.`,
    })
    return rows
  }
  if (!facts.manifest) {
    rows.push({
      key: 'manifest',
      status: 'bad',
      title: 'No manifest.json',
      detail:
        facts.manifestErrors[0] ??
        `There is no manifest.json at the root of the ${facts.repoInfo.defaultBranch} branch.`,
    })
  } else if (!manifest) {
    rows.push({
      key: 'manifest',
      status: 'bad',
      title: 'manifest.json has problems',
      detail: facts.manifestErrors.join(' · '),
    })
  } else {
    rows.push({
      key: 'manifest',
      status: 'ok',
      title: 'manifest.json found',
      detail: `${manifest.name} · id ${manifest.id} · module type ${manifest.moduleType} · icon ${manifest.icon}`,
    })
  }

  // Release
  if (!release) {
    rows.push({
      key: 'release',
      status: 'bad',
      title: 'No release yet',
      detail: `Publish a GitHub release and attach the built ${TARBALL_NAME}. That file is what every hub downloads.`,
    })
  } else if (!release.asset) {
    rows.push({
      key: 'release',
      status: 'bad',
      title: `Release ${release.tag} has no ${TARBALL_NAME}`,
      detail: `Attach the built ${TARBALL_NAME} to the release. Source archives do not count.`,
    })
  } else {
    const tagVersion = versionOfTag(release.tag)
    const mismatch = manifest?.version && manifest.version !== tagVersion
    rows.push({
      key: 'release',
      status: mismatch ? 'warn' : 'ok',
      title: `Release ${release.tag} with ${TARBALL_NAME}`,
      detail: mismatch
        ? `Published ${formatDate(release.publishedAt)} · ${formatBytes(release.asset.size)}. The manifest on ${facts.repoInfo.defaultBranch} says ${manifest.version}; the entry uses the release tag.`
        : `Published ${formatDate(release.publishedAt)} · ${formatBytes(release.asset.size)}`,
    })
  }

  // Hash
  const sha = normalizeSha256(facts.sha256)
  if (!release?.asset) {
    // Nothing to hash yet; the release row already says so.
  } else if (!sha) {
    rows.push({
      key: 'sha256',
      status: 'bad',
      title: 'Paste the SHA-256 of the download',
      detail: `GitHub does not let a web page read release files, so run shasum -a 256 ${TARBALL_NAME} and paste the result below. The registry refuses an entry without it.`,
    })
  } else if (!SHA256_RE.test(sha)) {
    rows.push({
      key: 'sha256',
      status: 'bad',
      title: 'That is not a SHA-256 hash',
      detail: 'It should be 64 hex characters, the first word of what shasum prints.',
    })
  } else {
    rows.push({
      key: 'sha256',
      status: 'ok',
      title: 'SHA-256 provided',
      detail: `${sha.slice(0, 4)}…${sha.slice(-4)} · checked against the download during review`,
    })
  }

  if (manifest) {
    // Category
    const category = manifest.category ?? ''
    const categoryOk = (PLUGIN_CATEGORIES as readonly string[]).includes(category)
    rows.push({
      key: 'category',
      status: categoryOk ? 'ok' : 'bad',
      title: categoryOk ? 'Category is one of the eight' : 'Category is not one the registry knows',
      detail: categoryOk ? category : `${JSON.stringify(category)} · use one of ${PLUGIN_CATEGORIES.join(', ')}`,
    })

    // App version
    const min = String(manifest.minAppVersion ?? '')
    const tooOld = Number.isNaN(compareSemver(min, MIN_SUPPORTED_APP_VERSION)) || compareSemver(min, MIN_SUPPORTED_APP_VERSION) < 0
    const tooNew = compareSemver(min, facts.currentAppVersion) > 0
    rows.push({
      key: 'minAppVersion',
      status: tooOld || tooNew ? 'bad' : 'ok',
      title: tooOld
        ? `minAppVersion must be ${MIN_SUPPORTED_APP_VERSION} or newer`
        : tooNew
          ? `minAppVersion is newer than the current release`
          : `Works on Home Screens ${min} and newer`,
      detail: tooOld
        ? `${MIN_SUPPORTED_APP_VERSION} is the first release with plugins.`
        : tooNew
          ? `The newest release is ${facts.currentAppVersion}; nobody could install a plugin that needs ${min}.`
          : `The newest release is ${facts.currentAppVersion}.`,
    })

    // Permissions
    const declared = declaredPermissions(manifest)
    const implied = impliedPermissions(manifest)
    const missing = implied.filter((p) => !declared.includes(p))
    rows.push({
      key: 'permissions',
      status: missing.length ? 'bad' : 'ok',
      title: missing.length ? 'Permissions are missing something' : 'Permissions declared',
      detail: missing.length
        ? `The manifest ${describeImplied(manifest)}, so it also needs ${missing.join(', ')}.`
        : declared.length
          ? `Declares ${declared.join(', ')}. A maintainer checks them against the bundle during review.`
          : 'Declares none. A maintainer checks the bundle during review.',
    })

    // Id
    const taken = facts.listedIds.includes(manifest.id ?? '')
    rows.push({
      key: 'id',
      status: taken ? 'bad' : 'ok',
      title: taken ? 'Id is already listed' : 'Id is free',
      detail: taken
        ? `A plugin with the id ${manifest.id} is already in the registry. To publish a new version, add a version row to its entry instead.`
        : `No listed plugin uses ${manifest.id}.`,
    })
  }

  // License
  rows.push(
    facts.repoInfo.license
      ? { key: 'license', status: 'ok', title: 'License file present', detail: facts.repoInfo.license }
      : {
          key: 'license',
          status: 'warn',
          title: 'No license file found',
          detail: 'Add a LICENSE file to the repo. MIT or Apache-2.0 are recommended.',
        },
  )

  return rows
}

function describeImplied(manifest: ManifestLike): string {
  const reasons: string[] = []
  if (nonEmptyArray(manifest.allowedDomains)) reasons.push('lists allowedDomains')
  if (nonEmptyArray(manifest.secrets)) reasons.push('asks for secrets')
  if (manifest.auth && typeof manifest.auth === 'object') reasons.push('declares an auth adapter')
  return reasons.join(' and ')
}

export function checksPass(rows: readonly CheckRow[]): boolean {
  return rows.length > 0 && rows.every((row) => row.status !== 'bad')
}

export type SubmissionReadiness = 'blocked' | 'needs-hash' | 'ready'

/**
 * Whether the form may show the entry and whether it may be sent. A missing
 * hash is the one failure that still allows a preview: everything else about
 * the entry is known, only the checksum is waiting on the author.
 */
export function submissionReadiness(rows: readonly CheckRow[]): SubmissionReadiness {
  if (rows.length === 0) return 'blocked'
  const failing = rows.filter((row) => row.status === 'bad').map((row) => row.key)
  if (failing.length === 0) return 'ready'
  return failing.every((key) => key === 'sha256') ? 'needs-hash' : 'blocked'
}

// ---------------------------------------------------------------------------
// The entry and the hand-off

export interface EntryOverrides {
  description: string
  tags: string[]
}

export function parseTags(input: string): string[] {
  return [...new Set(input.split(/[,\n]/).map((t) => t.trim().toLowerCase().replace(/\s+/g, '-')).filter(Boolean))]
}

/** The registry entry for a submission, or null until the facts allow one. */
export function buildEntry(facts: SubmissionFacts, overrides: EntryOverrides): RegistryPlugin | null {
  const { manifest, release, repo } = facts
  if (!manifest || facts.manifestErrors.length > 0 || !release?.asset || !manifest.id || !manifest.name) return null
  const sha = normalizeSha256(facts.sha256)
  const permissions = declaredPermissions(manifest)
  return {
    id: manifest.id,
    name: manifest.name,
    description: overrides.description.trim() || manifest.description || '',
    author: manifest.author || repo.owner,
    repo: `${repo.owner}/${repo.repo}`,
    license: facts.repoInfo?.license ?? manifest.license ?? 'UNLICENSED',
    category: manifest.category ?? '',
    tags: overrides.tags,
    icon: manifest.icon ?? 'Puzzle',
    verified: false,
    ...(permissions.length ? { permissions } : {}),
    versions: [
      {
        version: versionOfTag(release.tag),
        minAppVersion: manifest.minAppVersion ?? MIN_SUPPORTED_APP_VERSION,
        releaseDate: release.publishedAt ?? new Date().toISOString(),
        downloadUrl: release.asset.url,
        sha256: SHA256_RE.test(sha) ? sha : '',
        changelog: 'Initial release',
      },
    ],
  }
}

export function entryJson(entry: RegistryPlugin): string {
  return JSON.stringify(entry, null, 2)
}

/**
 * The registry repo's issue form, prefilled. Issue forms read query
 * parameters named after their field ids, so the page never needs a token or
 * a fork: the author opens it from their own account.
 */
export function submissionIssueUrl(entry: RegistryPlugin): string {
  const params = new URLSearchParams({
    template: SUBMISSION_ISSUE_TEMPLATE,
    title: `Add ${entry.name} v${entry.versions[0]?.version ?? ''}`.trim(),
    repo: entry.repo,
    entry: entryJson(entry),
  })
  return `https://github.com/${REGISTRY_REPO}/issues/new?${params.toString()}`
}
