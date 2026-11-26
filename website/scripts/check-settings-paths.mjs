/**
 * Every "Settings > A" and "Settings > A > B" phrase in the docs must name a
 * page the app's sidebar actually has, and a tab that page actually has.
 * The audit found a dozen paths naming pages that had been renamed.
 *
 *   node website/scripts/check-settings-paths.mjs
 *
 * Page names come from `settingsPages` in the app's English `core`
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
const DICT = path.join(ROOT, 'src', 'translations', 'en-US', 'core.json')

const core = JSON.parse(readFileSync(DICT, 'utf8'))
const pages = new Set(Object.values(core.settingsPages).map((v) => v.toLowerCase()))
// Sidebar entries that are not Defaults pages but are real destinations.
for (const extra of ['displays', 'all displays', 'per display', 'defaults']) pages.add(extra)

/** Tabs and named sections a "Settings > Page > X" path may point at. */
const TABS = {
  screen: ['rotation & appearance', 'sleep & dimming', 'alerts'],
  automation: ['profiles', 'rules', 'shared state'],
  calendar: ['ical / ics feeds', 'ical feeds', 'sign in with google', 'icloud calendar', 'people', 'public holidays', 'source status', 'adding events', 'calendar order', 'colors', 'whose calendars?'],
  security: ['display key', 'allowed networks', 'set a password', 'advanced network access'],
  'system & updates': ['check for updates', 'if an update caused trouble', 'if something seems stuck', 'restart the whole device', 'show advanced options', 'advanced'],
  // "Save or restore a file" cannot be checked: the pattern ends a path at " or ".
  'backups & data': ['automatic backups', 'undo an update', 'layouts and templates', 'share layout', 'templates', 'backup reminder'],
  status: ['diagnostics bundle', 'anonymous telemetry', 'last seen'],
  'on your phone': [],
  'api keys': [],
  weather: ['rain radar'],
  'location & language': [],
  meals: [],
  network: ['wifi', 'available wi-fi networks', 'ip address', 'hostname', 'diagnostics'],
  displays: ['all displays', 'waiting to be added'],
  'per display': ['all displays', 'overview', 'overrides'],
}

/** Where a path starts: "Settings >" (or the arrow some older pages used), but not a Mac's "System Settings >". */
const START = /(?<!System )Settings ?[>→] ?/g
const SEPARATOR = /^ ?[>→] ?/

/** Settings pages of other products the docs mention (Home Assistant's, the iPhone's). */
const OTHER_PRODUCTS = new Set(['devices & services', 'camera'])

/**
 * The longest of `names` that `text` starts with, ignoring case, or null. A
 * name only counts when the words after it are prose, not more of a name:
 * the next character is not a letter or digit, and is not a space before a
 * capital ("Settings > Location & language first" names Location & language;
 * "Settings > Screen Saver" names no page).
 */
function nameAtStart(text, names) {
  const lower = text.toLowerCase()
  let best = null
  for (const name of names) {
    if (!lower.startsWith(name)) continue
    const after = text.slice(name.length)
    if (/^[A-Za-z0-9]/.test(after) || /^ [A-Z]/.test(after)) continue
    if (!best || name.length > best.length) best = name
  }
  return best
}

/** The words a path names when they match nothing, for the report. */
function shown(text) {
  return text.split(/[.,;:)*\]_`\n]| > | → /)[0].trim().slice(0, 40)
}

let problems = 0
for (const file of readdirSync(DOCS).filter((f) => f.endsWith('.md')).sort()) {
  const lines = readFileSync(path.join(DOCS, file), 'utf8').split('\n')
  lines.forEach((line, i) => {
    for (const match of line.matchAll(START)) {
      const rest = line.slice(match.index + match[0].length)
      if (OTHER_PRODUCTS.has(nameAtStart(rest, OTHER_PRODUCTS))) continue
      const page = nameAtStart(rest, pages)
      if (!page) {
        problems += 1
        console.log(`${file}:${i + 1}  unknown page "Settings > ${shown(rest)}"`)
        continue
      }
      const tabs = TABS[page]
      const afterPage = rest.slice(page.length)
      const separator = afterPage.match(SEPARATOR)
      if (!tabs || !separator) continue
      const tabText = afterPage.slice(separator[0].length)
      if (!nameAtStart(tabText, tabs)) {
        problems += 1
        console.log(`${file}:${i + 1}  unknown tab "Settings > ${rest.slice(0, page.length)} > ${shown(tabText)}"`)
      }
    }
  })
}
console.log(problems === 0 ? 'Every Settings path names a real page.' : `\n${problems} path(s) to fix.`)
if (problems) process.exitCode = 1
