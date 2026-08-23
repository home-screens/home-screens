import { Container } from '@/components/Container';
import { Logo } from '@/components/Logo';
import { DISCORD_INVITE_URL, siteNavLinks } from '@/lib/site-navigation';

// The footer renders on every marketing surface, not just the homepage, so the
// homepage section links have to come from siteNavLinks (which uses absolute
// /#section paths) rather than bare #section fragments that only resolve on /.
const homepageSections = siteNavLinks.filter((link) =>
  link.href.startsWith('/#'),
);

const columns = [
  {
    title: 'Product',
    links: [
      ...homepageSections,
      { label: 'vs MagicMirror / Dakboard', href: '/vs' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Documentation', href: '/docs' },
      { label: 'Quick Start', href: '/docs/getting-started' },
      { label: 'Blog', href: '/blog' },
      { label: 'Changelog', href: '/changelog' },
    ],
  },
  {
    title: 'Project',
    links: [
      { label: 'GitHub', href: 'https://github.com/home-screens/home-screens' },
      { label: 'Discord', href: DISCORD_INVITE_URL },
      { label: 'Issues', href: 'https://github.com/home-screens/home-screens/issues' },
      { label: 'License', href: 'https://github.com/home-screens/home-screens/blob/main/LICENSE' },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-[#222] py-16">
      <Container>
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div>
            <Logo />
            <p className="mt-4 text-sm text-neutral-500">
              Your home. Your data. Your display.
            </p>
          </div>

          {/* Nav columns */}
          {columns.map((col) => (
            <div key={col.title}>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-400">
                {col.title}
              </h3>
              <ul className="mt-4 space-y-3">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-sm text-neutral-500 transition-colors hover:text-white"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 border-t border-[#222] pt-8 text-center text-xs text-neutral-600">
          MIT License. Built with Next.js, Tailwind CSS, and Raspberry Pi.
        </div>
      </Container>
    </footer>
  );
}
