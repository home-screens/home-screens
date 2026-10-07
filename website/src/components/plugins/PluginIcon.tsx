import { icons, Puzzle, type LucideIcon } from 'lucide-react'

/**
 * A registry entry names its icon the way Lucide does ("Flag", "Braces").
 * This resolves that name on the server, where pulling in the whole icon
 * set costs nothing at runtime; the directory's client component receives
 * the rendered SVG, never the lookup table.
 */
export function pluginIconComponent(name: string): LucideIcon {
  const pascal = name
    .split(/[-_\s]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
  return icons[pascal as keyof typeof icons] ?? icons[name as keyof typeof icons] ?? Puzzle
}

export function PluginIcon({ name, className }: { name: string; className?: string }) {
  const Icon = pluginIconComponent(name)
  return <Icon className={className} aria-hidden="true" />
}
