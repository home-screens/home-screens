export { TeamLogo } from '../shared/TeamLogo';

/** Formats a scheduled game's kickoff for the display (null = no usable instant). */
export type KickoffFn = (game: { startTime: string }) => string | null;

export function isWinner(
  game: { state: string; homeScore: number; awayScore: number },
  side: 'home' | 'away',
): boolean {
  if (game.state !== 'post') return false;
  return side === 'home' ? game.homeScore > game.awayScore : game.awayScore > game.homeScore;
}

export function formatScore(game: { state: string }, score: number): string {
  return game.state === 'pre' ? '–' : String(score);
}

/**
 * Status slot of a game row. Scheduled games show the kickoff label the
 * module formatted in the display's timezone (see kickoff.ts); in-progress
 * and final games keep ESPN's status word (clock / "Final").
 */
export function GameStatus({
  state,
  kickoff,
  status,
  dotSize = 'w-1.5 h-1.5',
  fontSize,
  gap = 'gap-1',
  liveColor = 'text-green-400',
  postColor = 'text-white/40',
  preColor = 'text-white/60',
}: {
  state: string;
  kickoff?: string | null;
  status: string;
  dotSize?: string;
  fontSize?: string;
  gap?: string;
  liveColor?: string;
  postColor?: string;
  preColor?: string;
}) {
  return (
    <div className={`flex items-center ${gap}`} style={fontSize ? { fontSize } : undefined}>
      {state === 'in' && (
        <span className={`${dotSize} rounded-full bg-green-400 animate-pulse`} />
      )}
      <span
        className={
          state === 'in'
            ? liveColor
            : state === 'post'
              ? postColor
              : preColor
        }
      >
        {(state === 'pre' && kickoff) || status}
      </span>
    </div>
  );
}
