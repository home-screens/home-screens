import { existsSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * The raw SVG of a Lucide icon, for places that cannot render a React
 * component: the plugin pages' Open Graph images are drawn by Satori in a
 * route handler, and Lucide's components are client components.
 *
 * Lucide ships each icon's path data beside the component, so this reads
 * that file by name at build time instead of carrying a copy of the icon set.
 */
export type IconNode = Array<[string, Record<string, string | number>]>

interface IconModule {
  __iconData?: { node?: IconNode }
}

/**
 * Resolved from the website's own node_modules rather than through
 * require.resolve: webpack rewrites that call into a module id, and the
 * build runs with website/ as the working directory.
 */
function iconsDir(): string {
  return path.join(process.cwd(), 'node_modules', 'lucide-react', 'dist', 'esm', 'icons')
}

/** "BadgeCheck" -> "badge-check", "Clock1" -> "clock-1"; a kebab name passes through. */
export function lucideFileName(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([a-zA-Z])(\d)/g, '$1-$2')
    .replace(/[_\s]+/g, '-')
    .toLowerCase()
}

export async function loadIconNode(name: string): Promise<IconNode | null> {
  const candidates = [lucideFileName(name), 'puzzle']
  for (const file of candidates) {
    const full = path.join(iconsDir(), `${file}.mjs`)
    if (!existsSync(full)) continue
    const mod = (await import(/* webpackIgnore: true */ pathToFileURL(full).href)) as IconModule
    const node = mod.__iconData?.node
    if (node) return node
  }
  return null
}
