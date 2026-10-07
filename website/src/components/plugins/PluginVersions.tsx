'use client'

import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { formatLongDate } from '@/lib/plugin-directory'
import type { RegistryPluginVersion } from '@/lib/plugin-registry-types'

const SHOWN_BY_DEFAULT = 4

/** The version list on a plugin page, newest first, collapsed after four. */
export function PluginVersions({
  versions,
  pluginIsBeta,
}: {
  versions: RegistryPluginVersion[]
  pluginIsBeta: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const hidden = Math.max(0, versions.length - SHOWN_BY_DEFAULT)
  const shown = expanded ? versions : versions.slice(0, SHOWN_BY_DEFAULT)

  return (
    <div className="overflow-hidden rounded-[14px] border border-[#222]">
      {shown.map((version, i) => (
        <div
          key={version.version}
          className={i === 0 ? 'grid gap-1 px-[18px] py-4 text-sm sm:grid-cols-[120px_1fr] sm:gap-4' : 'grid gap-1 border-t border-[#222] px-[18px] py-4 text-sm sm:grid-cols-[120px_1fr] sm:gap-4'}
        >
          <div>
            <div className="font-mono text-white">
              {version.version}
              {(pluginIsBeta || version.channel === 'beta') && (
                <Badge color="orange" className="ml-1.5 align-[1px]">
                  beta
                </Badge>
              )}
            </div>
            {version.releaseDate && (
              <div className="mt-1 text-xs text-neutral-500">{formatLongDate(version.releaseDate)}</div>
            )}
          </div>
          <div>
            {version.changelog ? (
              <div className="leading-[22px] text-neutral-400">{version.changelog}</div>
            ) : (
              <div className="leading-[22px] text-neutral-600">No notes for this version.</div>
            )}
            <div className="mt-1.5 text-xs text-neutral-500">
              Needs Home Screens {version.minAppVersion} or newer
            </div>
          </div>
        </div>
      ))}
      {hidden > 0 && !expanded && (
        <div className="border-t border-[#222] px-[18px] py-3.5 text-center">
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="text-[13px] text-neutral-400 hover:text-white"
          >
            Show {hidden} older {hidden === 1 ? 'version' : 'versions'}
          </button>
        </div>
      )}
    </div>
  )
}
