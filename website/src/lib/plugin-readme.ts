/**
 * Turns a plugin repo's README into something the plugin page can render.
 * This is the pure half: it takes the markdown GitHub shows and returns the
 * markdown Markdoc should parse. Rendering lives in `plugin-readme-render.tsx`.
 *
 * What changes:
 *   - the first H1 is dropped (the page already carries the plugin's name)
 *   - raw HTML outside code fences is removed (Markdoc has no HTML, it would
 *     print the tags as text)
 *   - `{%` outside code fences is defused so a Jinja example in prose cannot
 *     open a Markdoc tag and swallow the rest of the page
 *   - code fences are lifted out before any of that and handed back by
 *     index, so their contents are never touched
 */

export interface PreparedReadme {
  markdown: string
  /** The exact text of each fenced block, by the index its placeholder carries. */
  fences: string[]
}

const FENCE_RE = /^(`{3,}|~{3,})([^\n]*)\n([\s\S]*?)\n\1[ \t]*$/gm

export const FENCE_PLACEHOLDER_PREFIX = 'hs-readme-fence:'

export function prepareReadme(markdown: string): PreparedReadme {
  const fences: string[] = []
  const withPlaceholders = markdown.replace(FENCE_RE, (_m, marks: string, info: string, body: string) => {
    const index = fences.push(body) - 1
    const language = info.trim().split(/\s+/)[0] ?? ''
    return `${marks}${language}\n${FENCE_PLACEHOLDER_PREFIX}${index}\n${marks}`
  })

  const prose = withPlaceholders
    .replace(/^#\s[^\n]*\n?/, '')
    .replace(/^([^\n]+)\n=+[ \t]*\n/, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\/?[a-zA-Z][^<>]*>/g, '')
    .replace(/\{%/g, '{ %')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return { markdown: prose, fences }
}

/** Where a relative README link or image points on GitHub. */
export function resolveReadmeUrl(
  href: string,
  repo: string,
  kind: 'link' | 'image',
): string {
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(href)) return href
  const path = href.replace(/^\.?\//, '')
  return kind === 'image'
    ? `https://raw.githubusercontent.com/${repo}/HEAD/${path}`
    : `https://github.com/${repo}/blob/HEAD/${path}`
}

export function readmeUrl(repo: string): string {
  return `https://raw.githubusercontent.com/${repo}/HEAD/README.md`
}
