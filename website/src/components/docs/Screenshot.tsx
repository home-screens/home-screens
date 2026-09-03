import manifest from '../../../public/images/docs/manifest.json'

type ShotName = keyof typeof manifest

/**
 * A render from `npm run docs:shots` (website/scripts/capture-docs-shots.mts
 * in the main repo). Sizes and alt text come from the manifest the script
 * writes, so a page can never reference a shot that does not exist and the
 * image never shifts the layout while it loads.
 */
export function Screenshot({
  name,
  caption,
  alt,
  phone = false,
}: {
  name: string
  caption?: string
  alt?: string
  /** A phone-sized render: shown narrow and centered instead of full width. */
  phone?: boolean
}) {
  const entry = manifest[name as ShotName]
  if (!entry) {
    throw new Error(`Unknown docs screenshot "${name}". Run \`npm run docs:shots\` in the main repo and check manifest.json.`)
  }
  return (
    <figure className={phone ? 'mx-auto max-w-[360px]' : undefined}>
      <picture>
        <source srcSet={`/images/docs/${name}.webp`} type="image/webp" />
        <img
          src={`/images/docs/${name}.jpg`}
          alt={alt ?? entry.alt}
          width={entry.width}
          height={entry.height}
          loading="lazy"
          decoding="async"
          className="!my-0 h-auto w-full rounded-xl ring-1 ring-slate-900/10 dark:ring-white/10"
        />
      </picture>
      {caption && <figcaption className="text-center">{caption}</figcaption>}
    </figure>
  )
}
