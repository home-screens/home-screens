export const navigation = [
  {
    title: 'Introduction',
    links: [
      { title: 'Getting started', href: '/docs' },
      { title: 'Installation', href: '/docs/getting-started' },
      { title: 'Raspberry Pi', href: '/docs/raspberry-pi' },
    ],
  },
  {
    title: 'Guides',
    links: [
      { title: 'Editor', href: '/docs/editor' },
      { title: 'Modules', href: '/docs/modules' },
      { title: 'Backgrounds', href: '/docs/backgrounds' },
      { title: 'News feeds', href: '/docs/news' },
      { title: 'Profiles & Scheduling', href: '/docs/profiles' },
      { title: 'Remote Control', href: '/docs/remote-control' },
      { title: 'Voice Control', href: '/docs/voice-control' },
      { title: 'Multi-display', href: '/docs/multi-display' },
      { title: 'Networking', href: '/docs/networking' },
      { title: 'Troubleshooting', href: '/docs/troubleshooting' },
    ],
  },
  {
    title: 'Reference',
    links: [
      { title: 'API', href: '/docs/api' },
      { title: 'Module Reference', href: '/docs/module-reference' },
      { title: 'Configuration', href: '/docs/configuration' },
      { title: 'Plugins', href: '/docs/plugins' },
      { title: 'Development', href: '/docs/development' },
      { title: 'FAQ', href: '/docs/faq' },
    ],
  },
]

export type DocsSection = (typeof navigation)[number]
export type DocsLink = DocsSection['links'][number]

/** Every doc link flattened in sidebar order. */
const allDocsLinks: DocsLink[] = navigation.flatMap(
  (section) => section.links,
)

export interface DocsPageLocation {
  /** The link matching the pathname, or null if the page isn't in the nav. */
  link: DocsLink | null
  /** The section containing that link, or null. */
  section: DocsSection | null
  /** Previous link in sidebar order, or null at the first page / not found. */
  previous: DocsLink | null
  /** Next link in sidebar order, or null at the last page / not found. */
  next: DocsLink | null
}

/** Resolve a pathname to its nav link, containing section, and neighbours. */
export function findDocsPage(pathname: string): DocsPageLocation {
  const index = allDocsLinks.findIndex((link) => link.href === pathname)
  if (index === -1) {
    return { link: null, section: null, previous: null, next: null }
  }
  return {
    link: allDocsLinks[index],
    section:
      navigation.find((section) =>
        section.links.some((link) => link.href === pathname),
      ) ?? null,
    previous: allDocsLinks[index - 1] ?? null,
    next: allDocsLinks[index + 1] ?? null,
  }
}
