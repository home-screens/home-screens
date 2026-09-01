// Evaluate the docs search index outside webpack and print the top results
// for a few queries people actually type. Usage: node scripts/check-search.mjs [query ...]
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import { pathToFileURL } from 'url'
import { buildSearchData, searchModuleSource } from '../src/markdoc/search.mjs'

const data = buildSearchData(path.resolve('./content'))
const source = searchModuleSource(data).replace(
  "from 'flexsearch'",
  `from ${JSON.stringify(pathToFileURL(path.resolve('./node_modules/flexsearch/dist/flexsearch.bundle.module.min.js')).href)}`,
)
const tmp = path.join(os.tmpdir(), `hs-search-${process.pid}.mjs`)
fs.writeFileSync(tmp, source)
const { search } = await import(pathToFileURL(tmp).href)
fs.unlinkSync(tmp)

const queries = process.argv.length > 2
  ? process.argv.slice(2)
  : ['display shows black', 'weather says needs setup', 'how do I update', 'kid', 'chores', 'API key', 'update']

for (const query of queries) {
  console.log(`\n"${query}"`)
  for (const hit of search(query)) {
    console.log(`  ${hit.url}  —  ${hit.title}${hit.parentTitle ? ` (${hit.parentTitle})` : ''}`)
  }
}
