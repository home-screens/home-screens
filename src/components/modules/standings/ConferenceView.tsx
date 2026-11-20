'use client';

import type { StandingsGroup } from '@/lib/espn-standings';
import { leagueWallCode } from '@/lib/espn';
import { isFavoriteTeam } from '@/lib/sports-order';
import { inkLikeTailwind } from '@/lib/constants';
import { formatRecord, getPlayoffTeamCount, StandingsTeamRow } from './shared';
import { standingsRowsKey, useStandingsPaging } from './paging';
import { GamePagesFooter } from '../sports/shared';
import { PaginationDots } from '../shared/PaginationDots';

interface ConferenceViewProps {
  groups: StandingsGroup[];
  teamsToShow: number;
  showPlayoffLine: boolean;
  rotationIntervalMs: number;
  grouping: 'division' | 'conference' | 'league';
  /** `<league>:<ABBR>` keys whose rows stand out. */
  favorites?: string[];
  /** The card's type size; a change re-measures the pages. */
  fontSize: number;
}

const shownEntries = (group: StandingsGroup, teamsToShow: number) =>
  (teamsToShow > 0 ? group.entries.slice(0, teamsToShow) : group.entries);

function ConferenceColumn({
  group,
  teamsToShow,
  showPlayoffLine,
  grouping,
  favorites,
  visible,
  measured,
}: {
  group: StandingsGroup;
  teamsToShow: number;
  showPlayoffLine: boolean;
  grouping: 'division' | 'conference' | 'league';
  favorites: string[];
  /** Row numbers on the page that is showing; null while the rows are measured. */
  visible: Set<number> | null;
  /** The longer of the two columns: its rows decide where the pages break. */
  measured: boolean;
}) {
  const entries = shownEntries(group, teamsToShow);
  const playoffCount = getPlayoffTeamCount(group.league, grouping);

  return (
    <div className="flex-1 min-w-0" data-standings-fit={measured ? '' : undefined}>
      {entries.map((entry, i) => (
        <StandingsTeamRow
          key={entry.teamAbbr}
          entry={entry}
          showPlayoffCutoff={showPlayoffLine && entry.rank === playoffCount}
          highlight={isFavoriteTeam(group.league, entry.teamAbbr, favorites)}
          hidden={visible !== null && !visible.has(i)}
          showGradientBar={false}
          borderWidth={2}
          logoSize={14}
          rowClassName="flex items-center gap-1 py-0.5 px-1"
          rankClassName="text-current/25 tabular-nums shrink-0"
          rankStyle={{ fontSize: '0.6em', width: '1em', textAlign: 'right' }}
          nameClassName="text-current/80 truncate"
          nameStyle={{ fontSize: '0.65em' }}
          teamLabel={entry.teamAbbr}
          clincherClassName="text-emerald-400/60 ml-0.5"
          clincherStyle={{ fontSize: '0.8em' }}
        >
          <span className="text-current/50 tabular-nums shrink-0" style={{ fontSize: '0.6em' }}>
            {formatRecord(entry, group.league)}
          </span>
        </StandingsTeamRow>
      ))}
    </div>
  );
}

/** The longer group of a pair, whose rows the fit measures. */
function longerOf(pair: StandingsGroup[] | undefined, teamsToShow: number): StandingsGroup | undefined {
  if (!pair) return undefined;
  return pair.reduce<StandingsGroup | undefined>(
    (best, g) => (!best || shownEntries(g, teamsToShow).length > shownEntries(best, teamsToShow).length ? g : best),
    undefined,
  );
}

/**
 * Two groups side by side. Rows that do not fit are not clipped: both columns
 * turn their pages together, broken where the longer column's rows stop
 * fitting, and the next pair comes up after the last page.
 */
export function ConferenceView({ groups, teamsToShow, showPlayoffLine, rotationIntervalMs, grouping, favorites = [], fontSize }: ConferenceViewProps) {
  // Pair up groups (2 at a time for side-by-side)
  const pairs: StandingsGroup[][] = [];
  for (let i = 0; i < groups.length; i += 2) {
    pairs.push(groups.slice(i, i + 2));
  }

  const { ref, group: index, page, pages, visible } = useStandingsPaging(
    pairs.length,
    (p) => `${pairs[p]?.map((g) => g.name).join('+') ?? ''}|${standingsRowsKey(longerOf(pairs[p], teamsToShow), teamsToShow, fontSize)}`,
    rotationIntervalMs,
    '[data-standings-fit] [data-standings-row]',
  );
  const pair = pairs[index];

  if (!pair || pair.length === 0) return null;
  const longer = longerOf(pair, teamsToShow);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-2 pb-1.5 mb-1 border-b" style={{ borderColor: inkLikeTailwind(0.1) }}>
        <span
          className="font-semibold tracking-widest uppercase text-current/40"
          style={{ fontSize: '0.65em' }}
        >
          {leagueWallCode(pair[0].league)}
        </span>
        <PaginationDots total={pairs.length} current={index} />
      </div>

      <div className="flex gap-2 shrink-0">
        {pair.map((group) => (
          <div key={group.name} className="flex-1 min-w-0">
            <div className="px-1.5 pb-1 mb-1 border-b" style={{ borderColor: inkLikeTailwind(0.1) }}>
              <span className="text-current/50 font-medium" style={{ fontSize: '0.65em' }}>
                {group.name}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* gap-x, not gap: the fit reads this box's row gap as the room between
          rows, and the rows of a column sit flush. */}
      <div ref={ref} className="flex gap-x-2 flex-1 min-h-0 overflow-hidden" data-standings-pages={pages?.length ?? 1}>
        {pair.map((group) => (
          <ConferenceColumn
            key={group.name}
            group={group}
            teamsToShow={teamsToShow}
            showPlayoffLine={showPlayoffLine}
            grouping={grouping}
            favorites={favorites}
            visible={visible}
            measured={group === longer}
          />
        ))}
      </div>
      <GamePagesFooter pages={pages} index={page} />
    </div>
  );
}
