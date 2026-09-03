/**
 * The docs sidebar, in the order a new household needs the pages. Prev/Next,
 * the section eyebrow on each page, and the sitemap all read this array, so
 * adding a page here is the whole registration.
 *
 * Every slug the app links to (docs, backgrounds, modules, module-reference,
 * calendars, getting-started) must keep resolving; move content, not URLs.
 */
export const navigation = [
  {
    title: 'Start here',
    links: [
      { title: 'Overview', href: '/docs' },
      { title: 'What to buy', href: '/docs/what-to-buy' },
      { title: 'Install', href: '/docs/getting-started' },
      { title: 'Your first screen', href: '/docs/first-screen' },
      { title: 'On your phone', href: '/docs/remote-control' },
    ],
  },
  {
    title: 'Set up your content',
    links: [
      { title: 'Weather', href: '/docs/weather' },
      { title: 'Calendars', href: '/docs/calendars' },
      { title: 'Chores and rewards', href: '/docs/chores' },
      { title: 'Meals', href: '/docs/meals' },
      { title: 'Photos and backgrounds', href: '/docs/backgrounds' },
      { title: 'News', href: '/docs/news' },
    ],
  },
  {
    title: 'Customize',
    links: [
      { title: 'Editor', href: '/docs/editor' },
      { title: 'Modules', href: '/docs/modules' },
      { title: 'Profiles and schedules', href: '/docs/profiles' },
      { title: 'Plugins', href: '/docs/plugins' },
    ],
  },
  {
    title: 'More displays',
    links: [
      { title: 'Multi-display', href: '/docs/multi-display' },
    ],
  },
  {
    title: 'Help',
    links: [
      { title: 'Troubleshooting', href: '/docs/troubleshooting' },
      { title: 'FAQ', href: '/docs/faq' },
    ],
  },
  {
    title: 'Reference',
    links: [
      { title: 'Raspberry Pi internals', href: '/docs/raspberry-pi' },
      { title: 'Networking', href: '/docs/networking' },
      { title: 'Configuration', href: '/docs/configuration' },
      { title: 'Module reference', href: '/docs/module-reference' },
      { title: 'API', href: '/docs/api' },
      { title: 'Plugin development', href: '/docs/plugin-development' },
      { title: 'Voice control', href: '/docs/voice-control' },
      { title: 'Development', href: '/docs/development' },
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
