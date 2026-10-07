import Link from 'next/link'
import type { ReactNode } from 'react'
import { BadgeCheck } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { PermissionIcon } from '@/components/plugins/PermissionIcon'
import { formatShortDate, type DirectoryCard } from '@/lib/plugin-directory'
import { NO_PERMISSIONS_LABEL, orderedPermissions } from '@/lib/plugin-permissions'

export const VERIFIED_TITLE = 'Verified by the Home Screens team'

/**
 * One plugin in the directory grid. The whole card is the link; the icon is
 * rendered by the server page and handed in, so this component can live in
 * the client bundle without the Lucide lookup table.
 */
export function PluginCard({ plugin, icon }: { plugin: DirectoryCard; icon: ReactNode }) {
  const permissions = orderedPermissions(plugin.permissions)
  const version = plugin.shownVersion
  return (
    <Link
      href={`/plugins/${plugin.id}`}
      className="relative flex min-h-[230px] min-w-0 flex-col rounded-2xl border border-[#222] bg-[#161616] p-[22px] transition-colors hover:border-cyan-500/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50"
    >
      {(plugin.isNew || plugin.isBeta) && (
        <div className="absolute right-[18px] top-[18px] flex gap-1.5">
          {plugin.isNew && <Badge color="green">New</Badge>}
          {plugin.isBeta && <Badge color="orange">Beta</Badge>}
        </div>
      )}
      <div className="flex items-start gap-3.5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#2a2a2a] bg-[#0f0f0f] text-cyan-400/75 [&>svg]:h-[22px] [&>svg]:w-[22px]">
          {icon}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-[7px] text-[17px] font-semibold leading-[22px] text-white">
            <span className="truncate">{plugin.name}</span>
            {plugin.verified && (
              <BadgeCheck
                className="h-[17px] w-[17px] shrink-0 text-cyan-400"
                aria-label={VERIFIED_TITLE}
              >
                <title>{VERIFIED_TITLE}</title>
              </BadgeCheck>
            )}
          </div>
          <div className="mt-[3px] text-[13px] text-neutral-500">
            by <span className="font-medium text-neutral-400">{plugin.author}</span>
            {version && (
              <>
                <span className="mx-0.5 text-[#333]"> · </span>
                <span className="font-mono text-neutral-400">v{version.version}</span>
              </>
            )}
            {plugin.updatedAt && (
              <>
                <span className="mx-0.5 text-[#333]"> · </span>
                <span title="Last release">{formatShortDate(plugin.updatedAt)}</span>
              </>
            )}
          </div>
        </div>
      </div>
      <p className="mt-3.5 line-clamp-3 text-sm leading-[22px] text-neutral-400">{plugin.description}</p>
      <div className="mt-auto flex items-center justify-between gap-2.5 whitespace-nowrap pt-[18px] text-xs text-neutral-500">
        <Badge color="zinc">{plugin.category}</Badge>
        {permissions.length ? (
          <div className="flex gap-1">
            {permissions.map((permission) => (
              <PermissionIcon key={permission} permission={permission} />
            ))}
          </div>
        ) : (
          <span className="text-neutral-600">{NO_PERMISSIONS_LABEL}</span>
        )}
      </div>
    </Link>
  )
}
