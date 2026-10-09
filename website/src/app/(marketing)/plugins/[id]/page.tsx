import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BadgeCheck, ChevronRight } from 'lucide-react'

import { Container } from '@/components/Container'
import { GithubIcon } from '@/components/GithubIcon'
import { JsonLd } from '@/components/JsonLd'
import { CopyButton } from '@/components/plugins/CopyButton'
import { PermissionIcon } from '@/components/plugins/PermissionIcon'
import { PluginIcon } from '@/components/plugins/PluginIcon'
import { PluginScreenshots } from '@/components/plugins/PluginScreenshots'
import { PluginVersions } from '@/components/plugins/PluginVersions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  formatLongDate,
  repoIssuesUrl,
  repoName,
  repoUrl,
} from '@/lib/plugin-directory'
import { NO_PERMISSIONS_LABEL, orderedPermissions, PERMISSION_COPY } from '@/lib/plugin-permissions'
import { renderReadme } from '@/lib/plugin-readme-render'
import { getDirectoryPlugin, getDirectoryPlugins, getPluginReadme, getReadmeImageSizes } from '@/lib/plugins'

export async function generateStaticParams() {
  const plugins = await getDirectoryPlugins()
  return plugins.map((plugin) => ({ id: plugin.id }))
}

export const dynamicParams = false

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const plugin = await getDirectoryPlugin(id)
  if (!plugin) return {}
  const url = `https://homescreens.dev/plugins/${plugin.id}`
  const title = `${plugin.name} plugin`
  return {
    title,
    description: plugin.description,
    alternates: { canonical: url },
    openGraph: { title: `${title} for Home Screens`, description: plugin.description, url },
    twitter: { title: `${title} for Home Screens`, description: plugin.description },
  }
}

export default async function PluginPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const plugin = await getDirectoryPlugin(id)
  if (!plugin) notFound()

  const readme = await getPluginReadme(plugin)
  const imageSizes = readme ? await getReadmeImageSizes(plugin, readme) : {}
  const about = readme ? renderReadme(readme, plugin.repo, imageSizes) : null
  const permissions = orderedPermissions(plugin.permissions)
  const version = plugin.shownVersion
  const url = `https://homescreens.dev/plugins/${plugin.id}`

  return (
    <Container>
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 pt-8 text-[13px] text-neutral-500">
        <Link href="/plugins" className="text-neutral-400 hover:text-white">
          Plugins
        </Link>
        <ChevronRight className="h-3.5 w-3.5 text-[#333]" aria-hidden="true" />
        <Link href={`/plugins?category=${encodeURIComponent(plugin.category)}`} className="text-neutral-400 hover:text-white">
          {plugin.category}
        </Link>
        <ChevronRight className="h-3.5 w-3.5 text-[#333]" aria-hidden="true" />
        <span className="text-neutral-200">{plugin.name}</span>
      </nav>

      {/* Header */}
      <header className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between lg:gap-8">
        <div className="flex min-w-0 gap-4 sm:gap-5">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-[#2a2a2a] bg-[#0f0f0f] text-cyan-400/75 sm:h-16 sm:w-16">
            <PluginIcon name={plugin.icon} className="h-7 w-7 sm:h-[30px] sm:w-[30px]" />
          </div>
          <div className="min-w-0">
            <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">{plugin.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-sm text-neutral-400">
              <span>
                by <span className="font-medium text-neutral-200">{plugin.author}</span>
              </span>
              {plugin.verified && (
                <Badge color="cyan">
                  <BadgeCheck className="h-3 w-3" aria-hidden="true" />
                  Verified
                </Badge>
              )}
              {plugin.isBeta && <Badge color="orange">Beta</Badge>}
              <span className="text-[#333]">·</span>
              <Badge color="zinc">{plugin.category}</Badge>
              {version && (
                <>
                  <span className="text-[#333]">·</span>
                  <span className="font-mono">v{version.version}</span>
                </>
              )}
              {plugin.updatedAt && (
                <>
                  <span className="text-[#333]">·</span>
                  <span>Updated {formatLongDate(plugin.updatedAt)}</span>
                </>
              )}
            </div>
            <p className="mt-4 max-w-[720px] text-base leading-7 text-neutral-400 sm:text-[17px]">{plugin.description}</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2.5 lg:pt-1.5">
          <a
            href={repoUrl(plugin.repo)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#333] px-5 py-[11px] text-[15px] font-semibold text-neutral-200 transition-colors hover:border-cyan-400/50 hover:text-cyan-300"
          >
            <GithubIcon className="h-4 w-4" />
            GitHub
          </a>
          <Button href="#install" className="px-5 py-[11px] text-[15px]">
            Install in the editor
          </Button>
        </div>
      </header>

      <div className="mt-10 grid grid-cols-1 gap-10 pb-20 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-12">
        <div className="min-w-0">
          <PluginScreenshots name={plugin.name} screenshots={plugin.screenshots} />

          {about && (
            <>
              <h2 className={plugin.screenshots.length ? 'mb-3.5 mt-10 text-xl font-semibold text-white' : 'mb-3.5 text-xl font-semibold text-white'}>
                About
              </h2>
              <div className="prose prose-invert max-w-none text-[15px] leading-[26px] text-neutral-400 [overflow-wrap:anywhere] prose-headings:font-semibold prose-headings:tracking-tight prose-headings:text-white prose-h2:mt-8 prose-h2:text-lg prose-h3:text-base prose-p:my-3.5 prose-a:text-cyan-300 prose-a:no-underline hover:prose-a:text-cyan-200 prose-strong:font-medium prose-strong:text-neutral-200 prose-code:rounded prose-code:bg-[#161616] prose-code:px-1 prose-code:py-0.5 prose-code:text-[13px] prose-code:font-normal prose-code:text-neutral-300 prose-code:before:content-none prose-code:after:content-none prose-pre:border prose-pre:border-[#222] prose-pre:bg-[#0f0f0f] prose-li:my-1 prose-table:text-sm prose-th:text-neutral-300 prose-td:text-neutral-400 prose-hr:border-[#222]">
                {about}
              </div>
            </>
          )}

          <h2 className="mb-3.5 mt-10 text-xl font-semibold text-white">Versions</h2>
          <PluginVersions versions={plugin.versions} pluginIsBeta={plugin.isBeta} />
        </div>

        <aside className="flex flex-col gap-5">
          <section id="install" className="scroll-mt-24 rounded-[14px] border border-[#222] bg-[#161616] p-5">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">Install</h2>
            <ol className="m-0 list-decimal space-y-1.5 pl-5 text-sm leading-[22px] text-neutral-400">
              <li>
                Open the editor and click <b className="font-medium text-neutral-200">Plugins</b> in the top right.
              </li>
              <li>
                Find <b className="font-medium text-neutral-200">{plugin.name}</b> under Browse and click{' '}
                <b className="font-medium text-neutral-200">Install</b>.
                {plugin.isBeta && ' Turn on Show beta plugins first.'}
              </li>
              <li>Drag one of its modules onto a screen and set it up on the right.</li>
            </ol>
            {version && (
              <>
                <div className="mt-2.5 flex items-center gap-2.5 rounded-lg border border-[#2a2a2a] bg-[#0f0f0f] px-2.5 py-2 font-mono text-xs text-neutral-400">
                  <span className="min-w-0 flex-1 truncate" title={version.downloadUrl}>
                    {version.downloadUrl}
                  </span>
                  <CopyButton text={version.downloadUrl} label="Copy the download link" />
                </div>
                <p className="mt-2 text-xs text-neutral-500">
                  Or paste this link under <b className="font-medium text-neutral-400">Install from URL</b>.
                </p>
              </>
            )}
          </section>

          <section className="rounded-[14px] border border-[#222] bg-[#161616] p-5">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">What it needs</h2>
            {permissions.length === 0 ? (
              <p className="text-sm text-neutral-400">
                {NO_PERMISSIONS_LABEL}. It runs on the display with no keys and no internet access of its own.
              </p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-3 p-0">
                {permissions.map((permission) => (
                  <li key={permission} className="flex items-start gap-3 text-sm">
                    <PermissionIcon permission={permission} size="md" />
                    <div>
                      <div className="font-medium text-neutral-200">{PERMISSION_COPY[permission].label}</div>
                      <div className="text-[13px] leading-5 text-neutral-500">{PERMISSION_COPY[permission].detail}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-[14px] border border-[#222] bg-[#161616] p-5">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">Details</h2>
            <dl className="m-0 grid grid-cols-[110px_1fr] gap-x-3 gap-y-2 text-sm">
              {version && (
                <>
                  <dt className="text-neutral-500">Version</dt>
                  <dd className="m-0 font-mono text-neutral-200">{version.version}</dd>
                  <dt className="text-neutral-500">Needs</dt>
                  <dd className="m-0 text-neutral-200">Home Screens {version.minAppVersion}+</dd>
                </>
              )}
              <dt className="text-neutral-500">License</dt>
              <dd className="m-0 text-neutral-200">{plugin.license}</dd>
              <dt className="text-neutral-500">Author</dt>
              <dd className="m-0 truncate">
                <a href={`https://github.com/${plugin.repo.split('/')[0]}`} target="_blank" rel="noopener noreferrer" className="text-cyan-300 hover:text-cyan-200">
                  {plugin.author}
                </a>
              </dd>
              <dt className="text-neutral-500">Source</dt>
              <dd className="m-0 truncate">
                <a href={repoUrl(plugin.repo)} target="_blank" rel="noopener noreferrer" className="text-cyan-300 hover:text-cyan-200">
                  {repoName(plugin.repo)}
                </a>
              </dd>
              {plugin.firstListed && (
                <>
                  <dt className="text-neutral-500">First listed</dt>
                  <dd className="m-0 text-neutral-200">{formatLongDate(plugin.firstListed)}</dd>
                </>
              )}
              <dt className="text-neutral-500">Report</dt>
              <dd className="m-0">
                <a href={repoIssuesUrl(plugin.repo)} target="_blank" rel="noopener noreferrer" className="text-cyan-300 hover:text-cyan-200">
                  Open an issue
                </a>
              </dd>
            </dl>
          </section>

          {plugin.tags.length > 0 && (
            <section className="rounded-[14px] border border-[#222] bg-[#161616] p-5">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">Tags</h2>
              <div className="flex flex-wrap gap-1.5">
                {plugin.tags.map((tag) => (
                  <Link
                    key={tag}
                    href={`/plugins?q=${encodeURIComponent(tag)}`}
                    className="rounded-md border border-[#2a2a2a] px-2 py-0.5 font-mono text-xs text-neutral-400 hover:border-[#444] hover:text-white"
                  >
                    {tag}
                  </Link>
                ))}
              </div>
            </section>
          )}
        </aside>
      </div>

      <JsonLd
        schema={[
          {
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            name: plugin.name,
            description: plugin.description,
            url,
            applicationCategory: plugin.category,
            applicationSuite: 'Home Screens',
            operatingSystem: 'Linux',
            ...(version ? { softwareVersion: version.version, downloadUrl: version.downloadUrl } : {}),
            license: plugin.license,
            author: { '@type': plugin.author === 'home-screens' ? 'Organization' : 'Person', name: plugin.author },
            ...(plugin.firstListed ? { datePublished: plugin.firstListed.slice(0, 10) } : {}),
            ...(plugin.updatedAt ? { dateModified: plugin.updatedAt.slice(0, 10) } : {}),
            offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
          },
          {
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Plugins', item: 'https://homescreens.dev/plugins' },
              { '@type': 'ListItem', position: 2, name: plugin.name, item: url },
            ],
          },
        ]}
      />
    </Container>
  )
}
