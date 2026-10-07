import type { RegistryScreenshot } from '@/lib/plugin-registry-types'
import { SCREENSHOT_HEIGHT, SCREENSHOT_WIDTH } from '@/lib/plugin-screenshots'

/**
 * The pictures on a plugin page: the first one wide, the rest three to a
 * row. Returns nothing when a plugin has none, so the About section moves up.
 */
export function PluginScreenshots({
  name,
  screenshots,
}: {
  name: string
  screenshots: RegistryScreenshot[]
}) {
  if (screenshots.length === 0) return null
  const [first, ...rest] = screenshots
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Shot name={name} shot={first} wide />
      {rest.map((shot) => (
        <Shot key={shot.src} name={name} shot={shot} />
      ))}
    </div>
  )
}

function Shot({ name, shot, wide = false }: { name: string; shot: RegistryScreenshot; wide?: boolean }) {
  const alt = shot.caption ? `${name} plugin, ${shot.caption} view` : `${name} plugin`
  return (
    <figure className={wide ? 'm-0 overflow-hidden rounded-xl border border-[#222] bg-[#0f0f0f] sm:col-span-3' : 'm-0 overflow-hidden rounded-xl border border-[#222] bg-[#0f0f0f]'}>
      <img
        src={shot.src}
        alt={alt}
        width={SCREENSHOT_WIDTH}
        height={SCREENSHOT_HEIGHT}
        loading={wide ? 'eager' : 'lazy'}
        decoding="async"
        className="block aspect-[32/21] w-full object-cover"
      />
      {shot.caption && <figcaption className="px-2.5 py-2 text-xs text-neutral-500">{shot.caption}</figcaption>}
    </figure>
  )
}
