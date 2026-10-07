import type { PluginPermission } from './plugin-registry-types'

/**
 * The registry's permission words are developer words. Every place the site
 * shows a permission (card tooltips, the plugin page's "What it needs" list,
 * the submit page's checks) reads from this one table so the wording cannot
 * drift between surfaces.
 */
export interface PermissionCopy {
  /** Short line, used as the card tooltip and the list heading. */
  label: string
  /** Second line on the plugin page. */
  detail: string
  /** True for the one permission that deserves a warmer tint. */
  accent?: boolean
}

export const PERMISSION_COPY: Record<PluginPermission, PermissionCopy> = {
  network: {
    label: 'Reaches the internet',
    detail: 'Fetches from the web through your Pi, never from the display.',
  },
  localNetwork: {
    label: 'Talks to devices on your home network',
    detail: 'Can reach things like Home Assistant or a printer on your Wi-Fi.',
  },
  secrets: {
    label: 'Keeps a key or token on your Pi',
    detail: 'Stored on the Pi, never sent to the display.',
  },
  oauth: {
    label: 'Signs in for you',
    detail: 'Your sign-in is kept on the Pi and refreshed automatically.',
    accent: true,
  },
  events: {
    label: 'Reacts to taps and the display',
    detail: 'Can respond when you tap it or when a screen changes.',
  },
  storage: {
    label: 'Remembers things between restarts',
    detail: 'Keeps a little data on the Pi.',
  },
}

export const NO_PERMISSIONS_LABEL = 'Needs nothing'

/** Display order: the table's key order, with anything unknown dropped. */
export function orderedPermissions(
  permissions: readonly string[] | undefined,
): PluginPermission[] {
  const known = Object.keys(PERMISSION_COPY) as PluginPermission[]
  return known.filter((key) => permissions?.includes(key))
}
