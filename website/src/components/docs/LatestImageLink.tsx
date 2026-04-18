import { getLatestImageRelease } from '@/lib/changelog'

const RELEASES_FALLBACK =
  'https://github.com/home-screens/home-screens/releases'

export function LatestImageLink({ label }: { label?: string }) {
  const release = getLatestImageRelease()

  if (!release) {
    return (
      <a href={RELEASES_FALLBACK}>{label ?? 'Home Screens releases page'}</a>
    )
  }

  const text =
    label ?? `Download home-screens-${release.tag}.img.xz from GitHub`
  return <a href={release.imageUrl}>{text}</a>
}
