import clsx from 'clsx'
import {
  Database,
  Globe,
  KeyRound,
  LogIn,
  MousePointerClick,
  Wifi,
  type LucideIcon,
} from 'lucide-react'

import { PERMISSION_COPY } from '@/lib/plugin-permissions'
import type { PluginPermission } from '@/lib/plugin-registry-types'

const ICONS: Record<PluginPermission, LucideIcon> = {
  network: Globe,
  localNetwork: Wifi,
  secrets: KeyRound,
  oauth: LogIn,
  events: MousePointerClick,
  storage: Database,
}

/** One permission as a small boxed icon; the label is the tooltip. */
export function PermissionIcon({
  permission,
  size = 'sm',
}: {
  permission: PluginPermission
  size?: 'sm' | 'md'
}) {
  const Icon = ICONS[permission]
  const copy = PERMISSION_COPY[permission]
  return (
    <span
      title={copy.label}
      aria-label={copy.label}
      className={clsx(
        'flex shrink-0 items-center justify-center rounded-lg border border-[#262626] bg-[#0f0f0f]',
        size === 'sm' ? 'h-[26px] w-[26px]' : 'h-[30px] w-[30px]',
        copy.accent ? 'text-orange-300' : 'text-neutral-500',
      )}
    >
      <Icon className={size === 'sm' ? 'h-[13px] w-[13px]' : 'h-[15px] w-[15px]'} aria-hidden="true" />
    </span>
  )
}
