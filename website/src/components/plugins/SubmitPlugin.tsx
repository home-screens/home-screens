'use client'

import clsx from 'clsx'
import Link from 'next/link'
import { Check, ChevronRight, Package, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { GithubIcon } from '@/components/GithubIcon'
import { CopyButton } from '@/components/plugins/CopyButton'
import { PluginCard } from '@/components/plugins/PluginCard'
import { Button } from '@/components/ui/button'
import { derivePlugin, toDirectoryCard } from '@/lib/plugin-directory'
import { MANIFEST_SCHEMA_URL, REGISTRY_CONTRIBUTING_URL } from '@/lib/plugin-links'
import { DEFAULT_REGISTRY_URL, type PluginRegistry } from '@/lib/plugin-registry-types'
import {
  buildChecks,
  buildEntry,
  checksPass,
  entryJson,
  parseRepoUrl,
  parseTags,
  submissionIssueUrl,
  submissionReadiness,
  TARBALL_NAME,
  validateSchema,
  type CheckRow,
  type JsonSchema,
  type ManifestLike,
  type ReleaseInfo,
  type RepoInfo,
  type RepoRef,
  type SubmissionFacts,
} from '@/lib/plugin-submission'

/**
 * /plugins/submit, running entirely in the browser. GitHub's API and raw
 * file host both answer unauthenticated cross-origin reads, so the page can
 * look at a public repo without a backend. Release downloads do not, which
 * is why the author pastes the hash. The hand-off is a prefilled issue in
 * the registry repo that a workflow there turns into a pull request.
 */
type Step = 'repo' | 'check' | 'open'

interface Gathered {
  repo: RepoRef
  repoInfo: RepoInfo | null
  manifest: ManifestLike | null
  manifestErrors: string[]
  release: ReleaseInfo | null
  listedIds: string[]
}

async function getJson(url: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } })
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    body = null
  }
  return { status: res.status, body }
}

async function gather(repo: RepoRef): Promise<Gathered> {
  const base = `https://api.github.com/repos/${repo.owner}/${repo.repo}`
  const [repoRes, releaseRes, registryRes, schemaRes] = await Promise.all([
    getJson(base),
    getJson(`${base}/releases/latest`),
    getJson(DEFAULT_REGISTRY_URL),
    getJson(MANIFEST_SCHEMA_URL),
  ])

  if (repoRes.status === 403 || releaseRes.status === 403) {
    throw new Error('GitHub is rate limiting this browser for the moment. Try again in a few minutes.')
  }
  // The schema and the plugin list are what the checks are made of. Without
  // them a broken manifest would pass and a taken id would look free, so a
  // failed load is an error to retry, never a quieter check.
  if (schemaRes.status !== 200 || !schemaRes.body) {
    throw new Error(`Could not load the registry's manifest schema (GitHub answered ${schemaRes.status}). Try again in a moment.`)
  }
  if (registryRes.status !== 200 || !Array.isArray((registryRes.body as PluginRegistry | null)?.plugins)) {
    throw new Error(`Could not load the plugin list (GitHub answered ${registryRes.status}). Try again in a moment.`)
  }
  if (repoRes.status === 404) {
    return { repo, repoInfo: null, manifest: null, manifestErrors: [], release: null, listedIds: [] }
  }
  if (repoRes.status !== 200) {
    throw new Error(`GitHub answered ${repoRes.status} for the repo. Try again in a moment.`)
  }
  if (releaseRes.status !== 200 && releaseRes.status !== 404) {
    throw new Error(`GitHub answered ${releaseRes.status} for the latest release. Try again in a moment.`)
  }
  const r = repoRes.body as {
    license?: { spdx_id?: string } | null
    default_branch?: string
    description?: string | null
    html_url?: string
  }
  const repoInfo: RepoInfo = {
    license: r.license?.spdx_id && r.license.spdx_id !== 'NOASSERTION' ? r.license.spdx_id : null,
    defaultBranch: r.default_branch ?? 'main',
    description: r.description ?? null,
    htmlUrl: r.html_url ?? `https://github.com/${repo.owner}/${repo.repo}`,
  }

  let release: ReleaseInfo | null = null
  if (releaseRes.status === 200) {
    const rel = releaseRes.body as {
      tag_name: string
      published_at: string | null
      html_url: string
      assets?: Array<{ name: string; size: number; browser_download_url: string }>
    }
    const asset = rel.assets?.find((a) => a.name === TARBALL_NAME) ?? null
    release = {
      tag: rel.tag_name,
      publishedAt: rel.published_at,
      htmlUrl: rel.html_url,
      asset: asset ? { name: asset.name, size: asset.size, url: asset.browser_download_url } : null,
    }
  }

  const manifestErrors: string[] = []
  let manifest: ManifestLike | null = null
  const manifestRes = await fetch(
    `https://raw.githubusercontent.com/${repo.owner}/${repo.repo}/${repoInfo.defaultBranch}/manifest.json`,
  )
  if (manifestRes.ok) {
    try {
      manifest = (await manifestRes.json()) as ManifestLike
    } catch (err) {
      manifestErrors.push(`manifest.json is not valid JSON: ${(err as Error).message}`)
    }
    if (manifest) {
      manifestErrors.push(...validateSchema(manifest, schemaRes.body as JsonSchema))
    }
  } else if (manifestRes.status !== 404) {
    throw new Error(`GitHub answered ${manifestRes.status} for manifest.json. Try again in a moment.`)
  }

  const listedIds = (registryRes.body as PluginRegistry).plugins.map((p) => p.id)

  return { repo, repoInfo, manifest, manifestErrors, release, listedIds }
}

export function SubmitPlugin({ currentAppVersion }: { currentAppVersion: string }) {
  const [repoInput, setRepoInput] = useState('')
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [gathered, setGathered] = useState<Gathered | null>(null)
  // The hash belongs to one download. It is kept with the asset URL it was
  // typed for, so checking a different repo (or a repo whose release moved)
  // starts with an empty field instead of pairing the old hash with a new file.
  const [hash, setHash] = useState<{ asset: string; value: string }>({ asset: '', value: '' })
  const [description, setDescription] = useState('')
  const [tagsInput, setTagsInput] = useState('')
  const [showEntry, setShowEntry] = useState(false)
  const [opened, setOpened] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const runCheck = useCallback(async () => {
    const repo = parseRepoUrl(repoInput)
    if (!repo) {
      setError('Paste a GitHub link such as https://github.com/you/home-screens-plugin-thing.')
      return
    }
    setError(null)
    setChecking(true)
    setOpened(false)
    try {
      const result = await gather(repo)
      setGathered(result)
      setDescription(result.manifest?.description ?? '')
      setTagsInput('')
    } catch (err) {
      // Stale results under an error read as results. Start over instead.
      setGathered(null)
      setError((err as Error).message)
    } finally {
      setChecking(false)
    }
  }, [repoInput])

  const assetUrl = gathered?.release?.asset?.url ?? ''
  const sha256 = hash.asset === assetUrl ? hash.value : ''

  const facts: SubmissionFacts | null = useMemo(
    () => (gathered ? { ...gathered, currentAppVersion, sha256 } : null),
    [gathered, currentAppVersion, sha256],
  )
  const checks = useMemo(() => (facts ? buildChecks(facts) : []), [facts])
  const readiness = submissionReadiness(checks)
  const passing = checksPass(checks)
  const entry = useMemo(
    () =>
      facts && readiness !== 'blocked' ? buildEntry(facts, { description, tags: parseTags(tagsInput) }) : null,
    [facts, readiness, description, tagsInput],
  )
  const preview = useMemo(() => (entry ? toDirectoryCard(derivePlugin(entry, new Date())) : null), [entry])

  const step: Step = !gathered ? 'repo' : passing && opened ? 'open' : 'check'

  return (
    <div className="mx-auto max-w-[760px] pb-20">
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 pt-8 text-[13px] text-neutral-500">
        <Link href="/plugins" className="text-neutral-400 hover:text-white">
          Plugins
        </Link>
        <ChevronRight className="h-3.5 w-3.5 text-[#333]" aria-hidden="true" />
        <span className="text-neutral-200">Submit a plugin</span>
      </nav>
      <h1 className="mt-5 text-4xl font-semibold tracking-tight text-white sm:text-5xl">Submit your plugin</h1>
      <p className="mt-4 text-base text-neutral-400 sm:text-lg">
        Paste a link to your plugin&apos;s GitHub repo. We read its manifest and latest release, check the
        entry, and prepare the registry request for you.
      </p>

      <Progress step={step} />

      <form
        onSubmit={(e) => {
          e.preventDefault()
          void runCheck()
        }}
      >
        <Field label="GitHub repository" hint={`Public repo with a manifest.json at the root and a release that has ${TARBALL_NAME} attached.`}>
          <div className="flex flex-col gap-2.5 sm:flex-row">
            <input
              ref={inputRef}
              type="text"
              inputMode="url"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              value={repoInput}
              onChange={(e) => setRepoInput(e.target.value)}
              placeholder="https://github.com/you/home-screens-plugin-thing"
              aria-label="GitHub repository"
              className="h-11 min-w-0 flex-1 rounded-lg border border-[#333] bg-[#161616] px-3.5 text-[15px] text-white outline-none placeholder:text-neutral-600 focus:border-cyan-400/50"
            />
            <Button type="submit" variant={gathered ? 'outline' : 'solid'} disabled={checking} className="h-11 shrink-0">
              {checking ? <RefreshCw className="h-4 w-4 animate-spin" /> : gathered ? <RefreshCw className="h-4 w-4" /> : null}
              {checking ? 'Checking' : gathered ? 'Check again' : 'Check'}
            </Button>
          </div>
        </Field>
      </form>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-300">
          {error}
        </p>
      )}

      {checks.length > 0 && (
        <div className="mt-3.5 overflow-hidden rounded-[14px] border border-[#222]">
          {checks.map((row, i) => (
            <CheckLine key={row.key} row={row} first={i === 0} />
          ))}
        </div>
      )}

      {gathered?.release?.asset && (
        <Field
          label={`SHA-256 of ${TARBALL_NAME}`}
          hint={
            <>
              Download the file from your release, then run{' '}
              <code className="font-mono text-xs text-neutral-300">shasum -a 256 {TARBALL_NAME}</code> (Mac) or{' '}
              <code className="font-mono text-xs text-neutral-300">sha256sum {TARBALL_NAME}</code> (Linux) and paste the first word.
            </>
          }
        >
          <input
            type="text"
            value={sha256}
            onChange={(e) => setHash({ asset: assetUrl, value: e.target.value })}
            spellCheck={false}
            autoCapitalize="off"
            placeholder="64 hex characters"
            aria-label={`SHA-256 of ${TARBALL_NAME}`}
            className="h-11 w-full rounded-lg border border-[#333] bg-[#161616] px-3.5 font-mono text-sm text-white outline-none placeholder:text-neutral-600 focus:border-cyan-400/50"
          />
        </Field>
      )}

      {entry && (
        <>
          <Field
            label={
              <>
                Short description <span className="font-normal text-neutral-500">· from the manifest, edit if you like</span>
              </>
            }
          >
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              aria-label="Short description"
              className="w-full resize-y rounded-lg border border-[#333] bg-[#161616] px-3.5 py-2.5 text-[15px] leading-[22px] text-white outline-none focus:border-cyan-400/50"
            />
          </Field>
          <Field label="Tags" hint="Comma separated. These are what search matches on.">
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="transit, bus, train, departures"
              aria-label="Tags"
              className="h-11 w-full rounded-lg border border-[#333] bg-[#161616] px-3.5 text-[15px] text-white outline-none placeholder:text-neutral-600 focus:border-cyan-400/50"
            />
          </Field>
          <p className="mt-3 text-[13px] text-neutral-500">
            Pictures in your README show on the plugin page, so a screenshot or two there goes a long way.
          </p>

          {preview && entry && (
            <Field label="How it will look in the directory">
              <div className="max-w-[420px]">
                <PluginCard plugin={preview} icon={<Package />} />
              </div>
              <button
                type="button"
                onClick={() => setShowEntry((s) => !s)}
                className="mt-3.5 inline-flex items-center gap-1.5 text-[13px] text-neutral-400 hover:text-white"
              >
                <ChevronRight className={clsx('h-3.5 w-3.5 transition-transform', showEntry && 'rotate-90')} aria-hidden="true" />
                {showEntry ? 'Hide the registry entry' : 'Show the registry entry'}
              </button>
              {showEntry && (
                <div className="relative mt-3">
                  <pre className="overflow-auto rounded-[10px] border border-[#262626] bg-[#0f0f0f] px-4 py-3.5 font-mono text-xs leading-[18px] text-neutral-400">
                    {entryJson(entry)}
                  </pre>
                  <CopyButton text={entryJson(entry)} label="Copy the entry" className="absolute right-3 top-3" />
                </div>
              )}
            </Field>
          )}

          {passing ? (
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a
                href={submissionIssueUrl(entry)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOpened(true)}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-500 px-5 py-[11px] text-[15px] font-semibold text-[#0a0a0a] transition-colors hover:bg-cyan-400"
              >
                <GithubIcon className="h-4 w-4" />
                Open the request on GitHub
              </a>
              <CopyButton text={entryJson(entry)} label="Copy the entry instead" className="text-sm" />
              <span className="text-[13px] text-neutral-500">
                Opens GitHub with the entry filled in, to send from your own account.
              </span>
            </div>
          ) : (
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <span
                aria-disabled="true"
                className="inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-lg bg-cyan-500/30 px-5 py-[11px] text-[15px] font-semibold text-[#0a0a0a]/70"
              >
                <GithubIcon className="h-4 w-4" />
                Open the request on GitHub
              </span>
              <span className="text-[13px] text-neutral-500">Paste the SHA-256 above first.</span>
            </div>
          )}
        </>
      )}

      <div className="mt-7 rounded-xl border border-cyan-500/25 bg-cyan-500/[0.06] px-4 py-3.5 text-sm leading-[22px] text-neutral-300">
        <b className="font-medium text-white">What happens next.</b> A maintainer installs the plugin on a
        test hub and reads the bundle. Most reviews finish within a week. Once merged, the plugin appears here
        and in every editor&apos;s Browse tab, and future versions go through the same check with just a new
        release tag. Prefer to do it by hand?{' '}
        <a href={REGISTRY_CONTRIBUTING_URL} target="_blank" rel="noopener noreferrer" className="text-cyan-300 hover:text-cyan-200">
          The contributing guide
        </a>{' '}
        has the pull request path.
      </div>
    </div>
  )
}

function Progress({ step }: { step: Step }) {
  const steps: Array<{ key: Step; label: string }> = [
    { key: 'repo', label: 'Your repo' },
    { key: 'check', label: 'Check' },
    { key: 'open', label: 'Open the request' },
  ]
  const index = steps.findIndex((s) => s.key === step)
  return (
    <ol className="mb-7 mt-8 flex list-none items-center p-0">
      {steps.map((s, i) => {
        const done = i < index
        const current = i === index
        return (
          <li key={s.key} className="contents">
            {i > 0 && <span className="mx-3.5 h-px flex-1 bg-[#262626]" aria-hidden="true" />}
            <span className={clsx('flex items-center gap-2.5 text-sm', current ? 'text-white' : 'text-neutral-500')}>
              <span
                className={clsx(
                  'flex h-[26px] w-[26px] items-center justify-center rounded-full border font-mono text-xs',
                  done && 'border-cyan-500 bg-cyan-500 text-[#0a0a0a]',
                  current && 'border-cyan-400 text-cyan-400',
                  !done && !current && 'border-[#333]',
                )}
                aria-hidden="true"
              >
                {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className={clsx(i > 0 && 'hidden sm:inline')}>{s.label}</span>
              {current && <span className="sr-only">(current step)</span>}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

function Field({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="mt-[22px]">
      <label className="mb-1.5 block text-sm font-medium text-neutral-200">{label}</label>
      {children}
      {hint && <div className="mt-1.5 text-[13px] text-neutral-500">{hint}</div>}
    </div>
  )
}

function CheckLine({ row, first }: { row: CheckRow; first: boolean }) {
  return (
    <div className={clsx('flex items-start gap-3 px-4 py-3 text-sm', !first && 'border-t border-[#222]')}>
      <span
        className={clsx(
          'mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs',
          row.status === 'ok' && 'bg-green-500/15 text-green-300',
          row.status === 'warn' && 'bg-orange-500/15 text-orange-300',
          row.status === 'bad' && 'bg-red-500/15 text-red-300',
        )}
        aria-label={row.status === 'ok' ? 'Passed' : row.status === 'warn' ? 'Needs attention' : 'Failed'}
      >
        {row.status === 'ok' ? <Check className="h-3 w-3" /> : '!'}
      </span>
      <div className="min-w-0">
        <div className="font-medium text-neutral-200">{row.title}</div>
        <div className="mt-0.5 break-words text-[13px] text-neutral-500">{row.detail}</div>
      </div>
    </div>
  )
}
