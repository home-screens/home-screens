import { stats } from '../lib/stats'

// `@markdoc/next.js` auto-imports this module and spreads its exports into
// the Markdoc schema (alongside `tags.js`, `nodes.js`, `functions.js`).
// Anything under `variables` becomes available in `.md` files as
// `{% $name %}` — e.g. `{% $stats.moduleCount %}`.
export const variables = {
  stats,
}
