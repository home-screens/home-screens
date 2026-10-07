import Link from 'next/link'
import { ChevronRight, ExternalLink } from 'lucide-react'

import { PLUGIN_TEMPLATE_URL } from '@/lib/plugin-links'

const STEPS = [
  {
    title: 'Start from the template',
    body: 'Clone the plugin template. It builds a bundle and a manifest, and runs against a local hub while you work.',
    href: PLUGIN_TEMPLATE_URL,
    label: 'Plugin template',
    external: true,
  },
  {
    title: 'Publish a release',
    body: 'Tag a version on GitHub and attach the built plugin.tar.gz. That release is what every hub downloads.',
    href: '/docs/plugin-development',
    label: 'Plugin development guide',
    external: false,
  },
  {
    title: 'Submit it',
    body: 'Paste your repo link. We read the manifest and release, check the entry, and prepare the registry request for you.',
    href: '/plugins/submit',
    label: 'Submit a plugin',
    external: false,
  },
]

/** The closing section of the directory: how a plugin gets listed. */
export function GetListed() {
  return (
    <section className="mt-24 border-t border-[#1a1a1a] pt-16">
      <h2 className="text-3xl font-semibold tracking-tight text-white">Built one? Get it listed.</h2>
      <p className="mt-2 max-w-[560px] text-base text-neutral-400">
        Plugins live in their own GitHub repo and are listed in the open registry. Anyone can submit
        one; the team checks it, then it shows up here and in every editor.
      </p>
      <div className="mt-9 grid grid-cols-1 gap-5 md:grid-cols-3">
        {STEPS.map((step, i) => (
          <div key={step.title} className="rounded-2xl border border-[#222] bg-[#161616] p-[22px]">
            <div className="font-mono text-xs text-cyan-300">0{i + 1}</div>
            <h3 className="mb-1.5 mt-2.5 text-base font-semibold text-white">{step.title}</h3>
            <p className="text-sm leading-[22px] text-neutral-500">{step.body}</p>
            {step.external ? (
              <a
                href={step.href}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 text-sm text-cyan-300 hover:text-cyan-200"
              >
                {step.label}
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            ) : (
              <Link
                href={step.href}
                className="mt-3 inline-flex items-center gap-1.5 text-sm text-cyan-300 hover:text-cyan-200"
              >
                {step.label}
                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
