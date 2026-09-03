import Markdoc from '@markdoc/markdoc'
import { slugifyWithCounter } from '@sindresorhus/slugify'
import glob from 'fast-glob'
import * as fs from 'fs'
import * as path from 'path'
import { createLoader } from 'simple-functional-loader'
import * as url from 'url'

const __filename = url.fileURLToPath(import.meta.url)
const slugify = slugifyWithCounter()

/** Headings down to this level become their own result (so an FAQ question or a troubleshooting symptom is findable on its own). */
const MAX_SECTION_LEVEL = 3
/** First words of a section, shown under the result title. */
const SNIPPET_LENGTH = 140

/**
 * Pages that are a reference for maintainers (JSON keys, endpoints,
 * contributor setup). They are long and repeat every product word, so by
 * term frequency alone they outrank the guide that answers the question.
 * Results from them are listed after everything else.
 */
const REFERENCE_PAGES = [
  '/docs/api',
  '/docs/module-reference',
  '/docs/configuration',
  '/docs/development',
  '/docs/plugin-development',
  '/docs/raspberry-pi',
  '/docs/networking',
  '/docs/voice-control',
]

/**
 * Words people type mapped to the words the docs use. Each match adds a
 * rewritten query; results of the typed query still come first.
 */
const SYNONYMS = [
  ['black', 'blank'],
  ['dark', 'blank'],
  ['nothing', 'blank'],
  ['needs setup', 'api key'],
  ['setup', 'api key'],
  ['kids', 'chores'],
  ['kid', 'chores'],
  ['children', 'chores'],
  ['child', 'chores'],
  ['upgrade', 'update latest version'],
  ['update', 'latest version'],
  ['wifi', 'network'],
  ['wi-fi', 'network'],
  ['frozen', 'not updating'],
  ['stuck', 'not updating'],
  ['forgot', 'password'],
]

function toString(node) {
  // Inline code carries its text as an attribute, like plain text does;
  // without it "the `cache`" indexes and previews as "the ".
  let str =
    (node.type === 'text' || node.type === 'code') && typeof node.attributes?.content === 'string'
      ? node.attributes.content
      : ''
  if ('children' in node) {
    for (let child of node.children) {
      str += toString(child)
    }
  }
  return str
}

/**
 * Walk the page and collect one section per heading (H2 and H3), each with
 * the text that follows it: paragraphs, list items, and table cells. Code
 * blocks are skipped on purpose — the API page's samples would otherwise
 * drown the guides. An H3 remembers its H2 so the result can show where it
 * sits on the page.
 */
function extractSections(node, sections, state = { root: true, parent: null }) {
  if (state.root) {
    slugify.reset()
    state = { root: false, parent: null }
  }
  if (node.type === 'heading') {
    let content = toString(node).trim()
    let level = node.attributes.level
    if (level <= MAX_SECTION_LEVEL) {
      let hash = node.attributes?.id ?? slugify(content)
      if (level === 2) state.parent = content
      sections.push([content, hash, [], level === 3 ? state.parent : null])
    } else {
      sections.at(-1)[2].push(content)
    }
    return
  }
  if (node.type === 'paragraph' || node.type === 'td' || node.type === 'th') {
    let content = toString(node).trim()
    if (content) sections.at(-1)[2].push(content)
    return
  }
  if (node.type === 'item') {
    // A list item's own words, then its nested lists as their own entries
    // (recursing into the paragraph would count the words twice).
    let own = node.children
      .filter((child) => child.type !== 'list')
      .map(toString)
      .join(' ')
      .trim()
    if (own) sections.at(-1)[2].push(own)
    for (let child of node.children) {
      if (child.type === 'list') extractSections(child, sections, state)
    }
    return
  }
  if (node.type === 'fence') return
  if ('children' in node) {
    for (let child of node.children) {
      extractSections(child, sections, state)
    }
  }
}

function snippetOf(content) {
  let text = content.join(' ').replace(/\s+/g, ' ').trim()
  if (text.length <= SNIPPET_LENGTH) return text
  let cut = text.slice(0, SNIPPET_LENGTH)
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), SNIPPET_LENGTH - 30)) + '…'
}

/**
 * Build the index rows for every docs page under `contentDir`. Exported so
 * the index can be checked outside webpack (see scripts/check-search.mjs).
 */
export function buildSearchData(contentDir, cache = new Map()) {
  // Docs only: blog posts share words with every guide and were outranking
  // the page that answers the question.
  let files = glob.sync('docs/**/*.md', { cwd: contentDir })
  return files.map((file) => {
    // content/docs/index.md -> /docs, content/docs/api.md -> /docs/api
    let url = `/${file.replace(/\.md$/, '').replace(/\/index$/, '')}`
    let md = fs.readFileSync(path.join(contentDir, file), 'utf8')

    let sections

    if (cache.get(file)?.[0] === md) {
      sections = cache.get(file)[1]
    } else {
      let ast = Markdoc.parse(md)
      let title = ast.attributes?.frontmatter?.match(/^title:\s*(.*?)\s*$/m)?.[1]
      sections = [[title, null, [], null]]
      extractSections(ast, sections)
      cache.set(file, [md, sections])
    }

    return { url, sections }
  })
}

/**
 * Source of the module that `import('@/markdoc/search.mjs')` resolves to in
 * the browser. Also used by scripts/check-search.mjs, which evaluates it
 * against the real content to check what the search box answers.
 */
export function searchModuleSource(data) {
  return `
    import FlexSearch from 'flexsearch'

    let sectionIndex = new FlexSearch.Document({
      tokenize: 'full',
      document: {
        id: 'url',
        index: 'content',
        store: ['title', 'pageTitle', 'parentTitle', 'snippet'],
      },
      context: {
        resolution: 9,
        depth: 2,
        bidirectional: true
      }
    })

    let data = ${JSON.stringify(data)}
    const REFERENCE_PAGES = ${JSON.stringify(REFERENCE_PAGES)}
    const SYNONYMS = ${JSON.stringify(SYNONYMS)}

    for (let { url, sections } of data) {
      for (let [title, hash, content, parentTitle] of sections) {
        sectionIndex.add({
          url: url + (hash ? ('#' + hash) : ''),
          title,
          content: [title, ...content].join('\\n'),
          pageTitle: hash ? sections[0][0] : undefined,
          parentTitle: parentTitle ?? undefined,
          snippet: ${snippetOf.toString().replace(/SNIPPET_LENGTH/g, String(SNIPPET_LENGTH))}(content) || undefined,
        })
      }
    }

    function isReference(url) {
      let page = url.split('#')[0]
      return REFERENCE_PAGES.includes(page)
    }

    /** The typed query first, then one rewrite per synonym it contains. */
    function queryVariants(query) {
      let variants = [query]
      let lower = query.toLowerCase()
      for (let [typed, docsWord] of SYNONYMS) {
        let pattern = new RegExp('(^|\\\\W)' + typed.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&') + '(?=\\\\W|$)', 'i')
        if (pattern.test(lower)) variants.push(query.replace(pattern, '$1' + docsWord))
      }
      return variants
    }

    function rawSearch(query, limit, suggest = false) {
      let result = sectionIndex.search(query, { limit, enrich: true, suggest })
      if (result.length === 0) return []
      return result[0].result.map((item) => ({
        url: item.id,
        title: item.doc.title,
        pageTitle: item.doc.pageTitle,
        parentTitle: item.doc.parentTitle,
        snippet: item.doc.snippet,
      }))
    }

    export function search(query, options = {}) {
      let limit = options.limit ?? 8
      // Every word must match first; when nothing does (a question with a
      // filler word, "weather says needs setup"), fall back to the sections
      // matching the words that matter.
      let lists = queryVariants(query).map((variant) => {
        let found = rawSearch(variant, limit * 3)
        return found.length ? found : rawSearch(variant, limit * 3, true)
      })
      // Interleave the typed query with its rewrites, so "display black"
      // shows the page written as "Display is blank" near the top instead
      // of after every section that happens to contain both words.
      let seen = new Set()
      let hits = []
      for (let i = 0; lists.some((list) => i < list.length); i++) {
        for (let list of lists) {
          let hit = list[i]
          if (!hit || seen.has(hit.url)) continue
          seen.add(hit.url)
          hits.push(hit)
        }
      }
      // Guides, FAQ and Troubleshooting answer questions; reference pages
      // list keys. Keep each group's own order, guides first.
      let guides = hits.filter((hit) => !isReference(hit.url))
      let reference = hits.filter((hit) => isReference(hit.url))
      return [...guides, ...reference].slice(0, limit)
    }
  `
}

export default function withSearch(nextConfig = {}) {
  let cache = new Map()

  return Object.assign({}, nextConfig, {
    webpack(config, options) {
      config.module.rules.push({
        test: __filename,
        use: [
          createLoader(function () {
            let contentDir = path.resolve('./content')
            this.addContextDependency(contentDir)
            return searchModuleSource(buildSearchData(contentDir, cache))
          }),
        ],
      })

      if (typeof nextConfig.webpack === 'function') {
        return nextConfig.webpack(config, options)
      }

      return config
    },
  })
}
