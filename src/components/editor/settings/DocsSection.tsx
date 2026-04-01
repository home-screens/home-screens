import {
  BookOpen,
  Download,
  LayoutGrid,
  Blocks,
  Image,
  Clock,
  FileJson,
  Cpu,
  Globe,
  Wrench,
  Code,
  Puzzle,
  GitBranch,
  HelpCircle,
  ExternalLink,
  Smartphone,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/* ─── Documentation links ────────────────────── */

interface DocLink {
  title: string;
  href: string;
  description: string;
  icon: LucideIcon;
}

interface DocSection {
  title: string;
  links: DocLink[];
}

const DOCS_BASE = 'https://homescreens.dev';

const DOCS: DocSection[] = [
  {
    title: 'Introduction',
    links: [
      {
        title: 'Getting Started',
        href: '/docs',
        description: 'Overview of Home Screens and core concepts',
        icon: BookOpen,
      },
      {
        title: 'Installation',
        href: '/docs/getting-started',
        description: 'Set up on Raspberry Pi or run locally',
        icon: Download,
      },
      {
        title: 'Raspberry Pi',
        href: '/docs/raspberry-pi',
        description: 'Kiosk deployment, service management, SD card tips',
        icon: Cpu,
      },
    ],
  },
  {
    title: 'Guides',
    links: [
      {
        title: 'Editor',
        href: '/docs/editor',
        description: 'Visual editor walkthrough and canvas tools',
        icon: LayoutGrid,
      },
      {
        title: 'Modules',
        href: '/docs/modules',
        description: 'All 38 modules and their configuration options',
        icon: Blocks,
      },
      {
        title: 'Backgrounds',
        href: '/docs/backgrounds',
        description: 'Uploads, Unsplash, NASA APOD, and rotation',
        icon: Image,
      },
      {
        title: 'Profiles & Scheduling',
        href: '/docs/profiles',
        description: 'Automation and time-based screen layouts',
        icon: Clock,
      },
      {
        title: 'Configuration',
        href: '/docs/configuration',
        description: 'JSON schema and config file reference',
        icon: FileJson,
      },
      {
        title: 'Remote Control',
        href: '/docs/remote-control',
        description: 'Control your display from a phone or another device',
        icon: Smartphone,
      },
      {
        title: 'Networking',
        href: '/docs/networking',
        description: 'Reverse proxy, remote access, multi-display setup',
        icon: Globe,
      },
      {
        title: 'Troubleshooting',
        href: '/docs/troubleshooting',
        description: 'Common issues and fixes',
        icon: Wrench,
      },
    ],
  },
  {
    title: 'Reference',
    links: [
      {
        title: 'API',
        href: '/docs/api',
        description: 'All API endpoints and their parameters',
        icon: Code,
      },
      {
        title: 'Plugins',
        href: '/docs/plugins',
        description: 'Build custom modules with the plugin SDK',
        icon: Puzzle,
      },
      {
        title: 'Development',
        href: '/docs/development',
        description: 'Architecture overview and contributing guide',
        icon: GitBranch,
      },
      {
        title: 'FAQ',
        href: '/docs/faq',
        description: 'Frequently asked questions',
        icon: HelpCircle,
      },
    ],
  },
];

/* ─── Component ──────────────────────────────── */

export default function DocsSection() {
  return (
    <div className="space-y-0 divide-y divide-neutral-600 [&>section]:py-5 [&>section:first-child]:pt-0 [&>section:last-child]:pb-0">
      <section>
        <p className="text-sm text-neutral-400 leading-relaxed">
          Full documentation is available at{' '}
          <a
            href={`${DOCS_BASE}/docs`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 transition-colors"
          >
            homescreens.dev/docs
          </a>
          . Guides cover everything from initial setup to plugin development.
        </p>
      </section>

      {DOCS.map((section) => (
        <section key={section.title}>
          <h3 className="text-sm font-medium text-neutral-300 mb-3 uppercase tracking-wider">
            {section.title}
          </h3>
          <div className="grid gap-2">
            {section.links.map((link) => {
              const Icon = link.icon;
              return (
                <a
                  key={link.href}
                  href={`${DOCS_BASE}${link.href}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-start gap-3 rounded-lg border border-neutral-700 bg-neutral-800/40 px-3.5 py-3 transition-colors hover:bg-neutral-800 hover:border-neutral-600"
                >
                  <Icon className="w-4 h-4 mt-0.5 shrink-0 text-neutral-500 group-hover:text-blue-400 transition-colors" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium text-neutral-200 group-hover:text-white transition-colors">
                        {link.title}
                      </span>
                      <ExternalLink className="w-3 h-3 text-neutral-600 group-hover:text-neutral-400 transition-colors" />
                    </div>
                    <p className="text-xs text-neutral-500 mt-0.5 leading-relaxed">
                      {link.description}
                    </p>
                  </div>
                </a>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
