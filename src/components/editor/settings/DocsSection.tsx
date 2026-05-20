'use client';

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
  Monitor,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslate } from '@/i18n';

/* ─── Documentation links ────────────────────── */

interface DocLink {
  /** Translation sub-key under settings.docsPage.links — provides {title, description}. */
  linkKey: string;
  href: string;
  icon: LucideIcon;
}

interface DocSection {
  /** Translation sub-key under settings.docsPage.sections — provides the heading. */
  sectionKey: string;
  links: DocLink[];
}

const DOCS_BASE = 'https://homescreens.dev';

const DOCS: DocSection[] = [
  {
    sectionKey: 'introduction',
    links: [
      { linkKey: 'gettingStarted', href: '/docs', icon: BookOpen },
      { linkKey: 'installation', href: '/docs/getting-started', icon: Download },
      { linkKey: 'raspberryPi', href: '/docs/raspberry-pi', icon: Cpu },
    ],
  },
  {
    sectionKey: 'guides',
    links: [
      { linkKey: 'editor', href: '/docs/editor', icon: LayoutGrid },
      { linkKey: 'modules', href: '/docs/modules', icon: Blocks },
      { linkKey: 'backgrounds', href: '/docs/backgrounds', icon: Image },
      { linkKey: 'profiles', href: '/docs/profiles', icon: Clock },
      { linkKey: 'configuration', href: '/docs/configuration', icon: FileJson },
      { linkKey: 'remoteControl', href: '/docs/remote-control', icon: Smartphone },
      { linkKey: 'multiDisplay', href: '/docs/multi-display', icon: Monitor },
      { linkKey: 'networking', href: '/docs/networking', icon: Globe },
      { linkKey: 'troubleshooting', href: '/docs/troubleshooting', icon: Wrench },
    ],
  },
  {
    sectionKey: 'reference',
    links: [
      { linkKey: 'api', href: '/docs/api', icon: Code },
      { linkKey: 'plugins', href: '/docs/plugins', icon: Puzzle },
      { linkKey: 'development', href: '/docs/development', icon: GitBranch },
      { linkKey: 'faq', href: '/docs/faq', icon: HelpCircle },
    ],
  },
];

/* ─── Component ──────────────────────────────── */

export default function DocsSection() {
  const t = useTranslate('editor');
  return (
    <div className="space-y-0 divide-y divide-hs-border-strong [&>section]:py-5 [&>section:first-child]:pt-0 [&>section:last-child]:pb-0">
      <section>
        <p className="text-sm text-hs-text-muted leading-relaxed">
          {t('settings.docsPage.intro.part1')}
          <a
            href={`${DOCS_BASE}/docs`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-hs-accent hover:text-hs-accent-hover transition-colors"
          >
            {t('settings.docsPage.intro.linkLabel')}
          </a>
          {t('settings.docsPage.intro.part2')}
        </p>
      </section>

      {DOCS.map((section) => (
        <section key={section.sectionKey}>
          <h3 className="text-sm font-medium text-hs-text-secondary mb-3 uppercase tracking-wider">
            {t(`settings.docsPage.sections.${section.sectionKey}`)}
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
                  className="group flex items-start gap-3 rounded-lg border border-hs-border-strong bg-hs-hover px-3.5 py-3 transition-colors hover:bg-hs-active"
                >
                  <Icon className="w-4 h-4 mt-0.5 shrink-0 text-hs-text-faint group-hover:text-hs-accent-hover transition-colors" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium text-hs-text-body group-hover:text-hs-text-primary transition-colors">
                        {t(`settings.docsPage.links.${link.linkKey}.title`)}
                      </span>
                      <ExternalLink className="w-3 h-3 text-hs-text-faint group-hover:text-hs-text-muted transition-colors" />
                    </div>
                    <p className="text-xs text-hs-text-faint mt-0.5 leading-relaxed">
                      {t(`settings.docsPage.links.${link.linkKey}.description`)}
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
