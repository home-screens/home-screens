/**
 * Semver comparison, the same rules as the app's `src/lib/semver.ts`: a
 * prerelease sorts below its release, numeric identifiers compare as numbers.
 * The directory sorts versions by this, not by registry array order, so it
 * picks the same "latest" the editor does.
 */

function splitVersion(v: string): [string, string | null] {
  const idx = v.indexOf('-')
  if (idx === -1) return [v, null]
  return [v.substring(0, idx), v.substring(idx + 1)]
}

export function isPrerelease(version: string): boolean {
  return version.includes('-')
}

/** Returns >0 if a > b, <0 if a < b, 0 if equal. NaN when a segment is not a number. */
export function compareSemver(a: string, b: string): number {
  const [aVer, aPre] = splitVersion(a)
  const [bVer, bPre] = splitVersion(b)
  const pa = aVer.split('.').map(Number)
  const pb = bVer.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff
  }
  if (!aPre && !bPre) return 0
  if (!aPre) return 1
  if (!bPre) return -1
  const aIds = aPre.split('.')
  const bIds = bPre.split('.')
  for (let i = 0; i < Math.max(aIds.length, bIds.length); i++) {
    if (i >= aIds.length) return -1
    if (i >= bIds.length) return 1
    const aNum = parseInt(aIds[i], 10)
    const bNum = parseInt(bIds[i], 10)
    const aIsNum = !isNaN(aNum)
    const bIsNum = !isNaN(bNum)
    if (aIsNum && bIsNum) {
      if (aNum !== bNum) return aNum - bNum
    } else if (aIsNum) {
      return -1
    } else if (bIsNum) {
      return 1
    } else {
      const cmp = aIds[i].localeCompare(bIds[i])
      if (cmp !== 0) return cmp
    }
  }
  return 0
}
