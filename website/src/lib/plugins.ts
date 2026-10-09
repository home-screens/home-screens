import fs from 'node:fs'
import path from 'node:path'

import { derivePlugin, type DirectoryPlugin } from './plugin-directory'
import { imageDimensions, type ImageDimensions } from './image-dimensions'
import { readmeImageUrls, readmeUrl } from './plugin-readme'
import {
  DEFAULT_REGISTRY_URL,
  type PluginRegistry,
  type RegistryPlugin,
} from './plugin-registry-types'
import { LOCAL_SCREENSHOTS } from './plugin-screenshots'

/**
 * The plugin registry the app installs from is the only source the directory
 * has. It is read once per build (the site is a static export, so there is no
 * runtime read) and every plugin page is generated from it.
 *
 * `HS_PLUGIN_REGISTRY_URL` overrides the source: an http(s) URL, or a path to
 * a JSON file for local work and tests. With a file, READMEs are read from a
 * `readmes/<id>.md` beside it instead of GitHub, so an offline build is
 * possible without stubbing fetch.
 *
 * A registry that cannot be fetched or does not parse fails the build. A
 * broken registry must never ship as an empty directory.
 */

function registrySource(): string {
  return process.env.HS_PLUGIN_REGISTRY_URL?.trim() || DEFAULT_REGISTRY_URL
}

function isRemote(source: string): boolean {
  return /^https?:\/\//.test(source)
}

async function fetchText(url: string, attempt = 1): Promise<{ status: number; text: string }> {
  try {
    const res = await fetch(url)
    return { status: res.status, text: res.ok ? await res.text() : '' }
  } catch (err) {
    if (attempt < 3) return fetchText(url, attempt + 1)
    throw new Error(`Could not fetch ${url}: ${(err as Error).message}`)
  }
}

function assertRegistry(value: unknown, source: string): asserts value is PluginRegistry {
  const registry = value as Partial<PluginRegistry> | null
  if (!registry || typeof registry !== 'object' || !Array.isArray(registry.plugins)) {
    throw new Error(`The plugin registry at ${source} is not a registry (no plugins array).`)
  }
  for (const plugin of registry.plugins as Array<Partial<RegistryPlugin>>) {
    const missing = (['id', 'name', 'description', 'author', 'repo', 'category', 'versions'] as const).filter(
      (key) => plugin[key] === undefined,
    )
    if (missing.length) {
      throw new Error(
        `Plugin "${plugin.id ?? '?'}" in ${source} is missing ${missing.join(', ')}.`,
      )
    }
    if (!Array.isArray(plugin.versions) || plugin.versions.length === 0) {
      throw new Error(`Plugin "${plugin.id}" in ${source} has no versions.`)
    }
  }
}

let registryPromise: Promise<PluginRegistry> | null = null

export function loadPluginRegistry(): Promise<PluginRegistry> {
  if (!registryPromise) {
    registryPromise = (async () => {
      const source = registrySource()
      let text: string
      if (isRemote(source)) {
        const res = await fetchText(source)
        if (res.status !== 200) {
          throw new Error(`The plugin registry at ${source} answered ${res.status}.`)
        }
        text = res.text
      } else {
        text = fs.readFileSync(path.resolve(source), 'utf8')
      }
      let parsed: unknown
      try {
        parsed = JSON.parse(text)
      } catch (err) {
        throw new Error(`The plugin registry at ${source} is not valid JSON: ${(err as Error).message}`)
      }
      assertRegistry(parsed, source)
      return parsed
    })()
  }
  return registryPromise
}

let directoryPromise: Promise<DirectoryPlugin[]> | null = null

/** Every plugin in the registry with its derived fields, in registry order. */
export function getDirectoryPlugins(): Promise<DirectoryPlugin[]> {
  if (!directoryPromise) {
    directoryPromise = loadPluginRegistry().then((registry) => {
      const now = new Date()
      return registry.plugins.map((plugin) =>
        derivePlugin(plugin, now, plugin.screenshots ?? LOCAL_SCREENSHOTS[plugin.id] ?? []),
      )
    })
  }
  return directoryPromise
}

export async function getDirectoryPlugin(id: string): Promise<DirectoryPlugin | null> {
  const plugins = await getDirectoryPlugins()
  return plugins.find((plugin) => plugin.id === id) ?? null
}

const readmeCache = new Map<string, Promise<string | null>>()

/**
 * The README at the repo's default branch, or null when the repo has none.
 * Any other failure throws: a page that silently lost its About section is
 * worse than a build that says why.
 */
export function getPluginReadme(plugin: Pick<DirectoryPlugin, 'id' | 'repo'>): Promise<string | null> {
  let pending = readmeCache.get(plugin.id)
  if (!pending) {
    pending = (async () => {
      const source = registrySource()
      if (!isRemote(source)) {
        const file = path.join(path.dirname(path.resolve(source)), 'readmes', `${plugin.id}.md`)
        return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null
      }
      const res = await fetchText(readmeUrl(plugin.repo))
      if (res.status === 404) return null
      if (res.status !== 200) {
        throw new Error(`README for ${plugin.repo} answered ${res.status}.`)
      }
      return res.text
    })()
    readmeCache.set(plugin.id, pending)
  }
  return pending
}

const MAX_README_IMAGES = 24
const MAX_IMAGE_BYTES = 8 * 1024 * 1024

/**
 * The pixel size of every picture a README shows, keyed by the URL the
 * renderer will put in `src`, so each `<img>` can carry width and height and
 * the page keeps its shape while pictures load. A picture that cannot be
 * fetched, is too big, or is in a format the header reader does not know is
 * left out and renders unsized; the page checker reports those, which is
 * how a broken picture in a plugin's README gets noticed.
 */
export async function getReadmeImageSizes(
  plugin: Pick<DirectoryPlugin, 'repo'>,
  markdown: string,
): Promise<Record<string, ImageDimensions>> {
  const urls = readmeImageUrls(markdown, plugin.repo).slice(0, MAX_README_IMAGES)
  const sizes: Record<string, ImageDimensions> = {}
  await Promise.all(urls.map(async (url) => {
    try {
      const res = await fetch(url)
      if (!res.ok) return
      const length = Number(res.headers.get('content-length') ?? 0)
      if (length > MAX_IMAGE_BYTES) return
      const bytes = new Uint8Array(await res.arrayBuffer())
      if (bytes.byteLength > MAX_IMAGE_BYTES) return
      const size = imageDimensions(bytes)
      if (size) sizes[url] = size
    } catch {
      // Unreachable picture: rendered without a size, reported by the checker.
    }
  }))
  return sizes
}
