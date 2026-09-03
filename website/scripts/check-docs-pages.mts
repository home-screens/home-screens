/**
 * Render every docs page from the static export and check the things a
 * reader notices first:
 *
 *   - nothing pans the page sideways on a phone (390px) or a laptop (1440px)
 *   - inline code shows no literal backticks
 *   - every internal link and #anchor resolves
 *   - every image in the article returns 200 and declares its size
 *
 * Usage (from the repo root, after `cd website && npm run build`):
 *
 *   npx tsx website/scripts/check-docs-pages.mts
 *   npx tsx website/scripts/check-docs-pages.mts --only /docs/editor,/docs/modules
 *
 * Exits non-zero on any failure and prints one line per problem.
 */
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { navigation } from '../src/lib/docs-navigation'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(HERE, '..', 'out')
const PHONE = { width: 390, height: 844 }
const LAPTOP = { width: 1440, height: 900 }

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff': 'font/woff', '.woff2': 'font/woff2', '.txt': 'text/plain',
}

/** Map a URL path to a file in the export, the way Cloudflare Pages does. */
function resolveFile(urlPath: string): string | null {
  const clean = decodeURIComponent(urlPath.split('?')[0].split('#')[0]).replace(/\/+$/, '') || '/'
  const candidates = clean === '/'
    ? [path.join(OUT, 'index.html')]
    : [path.join(OUT, clean), path.join(OUT, `${clean}.html`), path.join(OUT, clean, 'index.html')]
  for (const file of candidates) {
    if (existsSync(file) && statSync(file).isFile()) return file
  }
  return null
}

function serve(): Promise<{ baseURL: string; close: () => void }> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const file = resolveFile(req.url ?? '/')
      if (!file) { res.writeHead(404); res.end('not found'); return }
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' })
      res.end(readFileSync(file))
    })
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number }
      resolve({ baseURL: `http://127.0.0.1:${port}`, close: () => server.close() })
    })
  })
}

/** All ids in an exported page, for cross-page anchor checks. */
const idCache = new Map<string, Set<string>>()
function idsOf(urlPath: string): Set<string> | null {
  const file = resolveFile(urlPath)
  if (!file || !file.endsWith('.html')) return null
  let ids = idCache.get(file)
  if (!ids) {
    ids = new Set<string>()
    for (const match of readFileSync(file, 'utf8').matchAll(/\sid="([^"]+)"/g)) ids.add(match[1])
    idCache.set(file, ids)
  }
  return ids
}

interface PageReport {
  href: string
  overflowPhone: number
  overflowLaptop: number
  backticks: number
  brokenLinks: string[]
  imageProblems: string[]
}

async function main(): Promise<void> {
  if (!existsSync(path.join(OUT, 'index.html'))) {
    throw new Error(`No export at ${OUT}. Run \`npm run build\` in website/ first.`)
  }
  const onlyArg = process.argv.find((a) => a.startsWith('--only='))?.slice(7)
    ?? (process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : undefined)
  const only = onlyArg ? new Set(onlyArg.split(',')) : null
  const hrefs = navigation.flatMap((s) => s.links.map((l) => l.href)).filter((h) => !only || only.has(h))

  const { baseURL, close } = await serve()
  const browser = await chromium.launch()
  const reports: PageReport[] = []
  try {
    for (const href of hrefs) {
      const report: PageReport = { href, overflowPhone: 0, overflowLaptop: 0, backticks: 0, brokenLinks: [], imageProblems: [] }
      for (const [label, viewport] of [['phone', PHONE], ['laptop', LAPTOP]] as const) {
        const context = await browser.newContext({ viewport, baseURL })
        const page = await context.newPage()
        const missingImages: string[] = []
        page.on('response', (res) => {
          if (res.request().resourceType() === 'image' && res.status() >= 400) missingImages.push(res.url())
        })
        await page.goto(href, { waitUntil: 'networkidle' })
        const measured = await page.evaluate(() => {
          const article = document.querySelector('article')
          const overflow = Math.max(0, document.documentElement.scrollWidth - window.innerWidth)
          let backticks = 0
          for (const code of Array.from(document.querySelectorAll('article code'))) {
            if (code.closest('pre')) continue
            const before = getComputedStyle(code, '::before').content
            const after = getComputedStyle(code, '::after').content
            if (before.includes('`') || after.includes('`')) backticks += 1
          }
          const links = Array.from(article?.querySelectorAll<HTMLAnchorElement>('a[href]') ?? [])
            .map((a) => a.getAttribute('href') ?? '')
            .filter((h) => h.startsWith('/') || h.startsWith('#'))
          const images = Array.from(article?.querySelectorAll<HTMLImageElement>('img') ?? []).map((img) => ({
            src: img.getAttribute('src') ?? '',
            sized: img.hasAttribute('width') && img.hasAttribute('height'),
          }))
          const ids = new Set(Array.from(document.querySelectorAll('[id]')).map((el) => el.id))
          return { overflow, backticks, links, images, ids: Array.from(ids) }
        })
        if (label === 'phone') report.overflowPhone = measured.overflow
        else report.overflowLaptop = measured.overflow
        if (label === 'laptop') {
          report.backticks = measured.backticks
          const ownIds = new Set(measured.ids)
          for (const link of new Set(measured.links)) {
            const [target, anchor] = link.split('#')
            if (target === '' || target === href) {
              if (anchor && !ownIds.has(anchor)) report.brokenLinks.push(link)
              continue
            }
            const ids = idsOf(target)
            if (!ids) {
              // A download (the Voice Control YAML files) rather than a page.
              if (!resolveFile(target)) report.brokenLinks.push(link)
              continue
            }
            if (anchor && !ids.has(anchor)) report.brokenLinks.push(link)
          }
          for (const img of measured.images) {
            if (!img.sized) report.imageProblems.push(`${img.src} has no width/height`)
            if (img.src.startsWith('/') && !resolveFile(img.src)) report.imageProblems.push(`${img.src} is not in the export`)
          }
          for (const url of missingImages) report.imageProblems.push(`${url} returned an error`)
        }
        await context.close()
      }
      reports.push(report)
      const problems = report.overflowPhone + report.overflowLaptop + report.backticks + report.brokenLinks.length + report.imageProblems.length
      console.log(`${problems === 0 ? ' ok ' : 'FAIL'} ${href.padEnd(28)} phone+${report.overflowPhone}px laptop+${report.overflowLaptop}px backticks=${report.backticks} links=${report.brokenLinks.length} images=${report.imageProblems.length}`)
      for (const link of report.brokenLinks) console.log(`       broken link: ${link}`)
      for (const problem of report.imageProblems) console.log(`       image: ${problem}`)
    }
  } finally {
    await browser.close()
    close()
  }
  const failed = reports.filter((r) => r.overflowPhone || r.overflowLaptop || r.backticks || r.brokenLinks.length || r.imageProblems.length)
  console.log(`\n${reports.length - failed.length}/${reports.length} pages clean`)
  if (failed.length) process.exitCode = 1
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
