import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Package } from 'lucide-react'

import { Container } from '@/components/Container'
import { JsonLd } from '@/components/JsonLd'
import { GetListed } from '@/components/plugins/GetListed'
import { PluginDirectory } from '@/components/plugins/PluginDirectory'
import { PluginIcon } from '@/components/plugins/PluginIcon'
import { Badge } from '@/components/ui/badge'
import { toDirectoryCard } from '@/lib/plugin-directory'
import { PLUGIN_CATEGORIES } from '@/lib/plugin-registry-types'
import { getDirectoryPlugins } from '@/lib/plugins'

const DESCRIPTION =
  'Browse every Home Screens plugin: Home Assistant, Garmin, Strava and more. Each one installs in two clicks from the editor and runs on your Pi, not in the cloud.'

export const metadata: Metadata = {
  title: 'Plugins',
  description: DESCRIPTION,
  alternates: { canonical: 'https://homescreens.dev/plugins' },
  openGraph: {
    title: 'Plugins for your Home Screens display',
    description: DESCRIPTION,
    url: 'https://homescreens.dev/plugins',
  },
  twitter: {
    title: 'Plugins for your Home Screens display',
    description: DESCRIPTION,
  },
}

export default async function PluginsPage() {
  const plugins = await getDirectoryPlugins()
  const icons: Record<string, ReactNode> = {}
  for (const plugin of plugins) {
    icons[plugin.id] = <PluginIcon name={plugin.icon} />
  }

  return (
    <Container>
      <div className="pb-20">
        <div className="pt-16 text-center sm:pt-24">
          <Badge color="cyan">
            <Package className="h-3 w-3" aria-hidden="true" />
            Plugin directory
          </Badge>
          <h1 className="mt-6 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            Plugins for your display
          </h1>
          <p className="mx-auto mt-4 max-w-[620px] text-base text-neutral-400 sm:text-lg">
            Home Assistant, Garmin, Strava and more. Every plugin here installs in two clicks from
            the editor and runs on your Pi, not in the cloud.
          </p>
        </div>

        <PluginDirectory
          plugins={plugins.map(toDirectoryCard)}
          icons={icons}
          categories={PLUGIN_CATEGORIES}
        />

        <GetListed />
      </div>
      <JsonLd
        schema={{
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: 'Home Screens plugins',
          description: DESCRIPTION,
          url: 'https://homescreens.dev/plugins',
          mainEntity: {
            '@type': 'ItemList',
            itemListElement: plugins.map((plugin, i) => ({
              '@type': 'ListItem',
              position: i + 1,
              url: `https://homescreens.dev/plugins/${plugin.id}`,
              name: plugin.name,
            })),
          },
        }}
      />
    </Container>
  )
}
