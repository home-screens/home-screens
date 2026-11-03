/**
 * Fisher-Yates shuffle, returning a copy. `random` is Math.random unless the
 * caller needs the same order every time, in which case it passes a seeded
 * source such as `mulberry32`.
 */
export function shuffleArray<T>(arr: T[], random: () => number = Math.random): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
