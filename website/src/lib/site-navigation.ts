/**
 * Site-wide navigation links shared between the marketing header and docs header.
 * Homepage anchor links use absolute paths (/#section) so they work from any page.
 */
export const siteNavLinks = [
  { label: 'Features', href: '/#features' },
  { label: 'Modules', href: '/#modules' },
  { label: 'Templates', href: '/#templates' },
  { label: 'Docs', href: '/docs' },
  { label: 'Blog', href: '/blog' },
  { label: 'Changelog', href: '/changelog' },
];

/** Community Discord, linked from the marketing header, docs header, and footer. */
export const DISCORD_INVITE_URL = 'https://discord.gg/KafmFuSNU';
