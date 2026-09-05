/**
 * Every "Settings > A" and "Settings > A > B" phrase in the docs must name a
 * page the app's sidebar actually has, and a tab that page actually has.
 * The audit found a dozen paths naming pages that had been renamed.
 *
 *   node website/scripts/check-settings-paths.mjs
 *
 * Page names come from `settings.sidebar.navLabels` in the app's English
 * dictionary; tab names are listed here because they live in each section's
 * own strings. Prints every unknown path with its file and line, and exits
 * non-zero when there is at least one.
 */
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..')
const DOCS = path.join(ROOT, 'website', 'content', 'docs')
const DICT = path.join(ROOT, 'src', 'translations', 'en-US', 'editor.json')

const editor = JSON.parse(readFileSync(DICT, 'utf8'))
const pages = new Set(Object.values(editor.settings.sidebar.navLabels).map((v) => v.toLowerCase()))
// Sidebar entries that are not Defaults pages but are real destinations.
for (const extra of ['displays', 'all displays', 'per display', 'defaults']) pages.add(extra)

/** Tabs and named sections a "Settings > Page > X" path may point at. */
const TABS = {
  screen: ['rotation & appearance', 'sleep & dimming', 'alerts'],
  automation: ['profiles', 'rules', 'shared state'],
  calendar: ['ical / ics feeds', 'ical feeds', 'sign in with google', 'icloud calendar', 'people', 'public holidays', 'source status'],
  security: ['display key', 'allowed networks', 'set a password'],
  'system & updates': ['check for updates', 'if an update caused trouble', 'if something seems stuck', 'restart the whole device', 'show advanced options', 'advanced'],
  'backups & data': ['save a copy', 'automatic snapshots', 'share layout', 'templates', 'backup reminder'],
  status: ['diagnostics bundle', 'anonymous telemetry', 'last seen'],
  'on your phone': [],
  'api keys': [],
  weather: ['rain radar'],
  'location & language': [],
  meals: [],
  network: ['wifi', 'ip address', 'hostname', 'diagnostics'],
  displays: ['all displays', 'waiting to be added'],
  'per display': ['all displays', 'overview', 'overrides'],
}

const PATTERN = /Settings(?: ?[>→] ?([A-Za-z&/ ]+?))(?: ?[>→] ?([A-Za-z&/ ]+?))?(?=[.,;:)*\]_`\n]| and | or | to | in | so | while | which | where | when | is | shows| lists| has| holds| sets| page)/g

/** Settings pages of other products the docs mention (Home Assistant's). */
const OTHER_PRODUCTS = new Set(['devices & services'])

let problems = 0
for (const file of readdirSync(DOCS).filter((f) => f.endsWith('.md')).sort()) {
  const lines = readFileSync(path.join(DOCS, file), 'utf8').split('\n')
  lines.forEach((line, i) => {
    for (const match of line.matchAll(PATTERN)) {
      const page = match[1]?.trim().toLowerCase()
      const tab = match[2]?.trim().toLowerCase()
      if (!page || OTHER_PRODUCTS.has(page)) continue
      if (!pages.has(page)) {
        problems += 1
        console.log(`${file}:${i + 1}  unknown page "Settings > ${match[1].trim()}"`)
        continue
      }
      if (tab && TABS[page] && !TABS[page].includes(tab)) {
        problems += 1
        console.log(`${file}:${i + 1}  unknown tab "Settings > ${match[1].trim()} > ${match[2].trim()}"`)
      }
    }
  })
}
console.log(problems === 0 ? 'Every Settings path names a real page.' : `\n${problems} path(s) to fix.`)
if (problems) process.exitCode = 1
