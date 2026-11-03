'use client';

/**
 * The card under the rows: what goes in each bag for the day the rows show.
 *
 * One entry per person, in the row order, with the subjects' items as pills.
 * A person with nothing to pack says so, and a person whose school is shut
 * says that instead, so no entry is ever blank. In columns the same pills sit
 * in each column's head and this card is not drawn.
 */

import { Backpack } from 'lucide-react';
import { ink } from '@/lib/constants';
import { smallPrintPx } from '@/lib/timetable-layout';
import type { RowsGeometry, DayGeometry } from '@/lib/timetable-day-fit';
import { pickGridTimeColor } from '@/lib/calendar-color';
import { BringPills, type DayPerson, type DayTokens } from './DayCard';
import { memberInitials, memberInk } from '@/lib/family-avatar';

export interface PackingStripProps {
  /** "Pack tonight", "Bring today" or "Pack for Monday". */
  title: string;
  /** "for Friday, 11 September". */
  subtitle: string;
  persons: readonly DayPerson[];
  geometry: DayGeometry;
  tokens: DayTokens;
}

function atLeast(px: number, em: number, base: number): string {
  return `${smallPrintPx(base, { px, em }).toFixed(2)}px`;
}

export default function PackingStrip({ title, subtitle, persons, geometry, tokens }: PackingStripProps) {
  const g = geometry as RowsGeometry;
  return (
    <div
      data-testid="timetable-pack-strip"
      style={{
        display: 'grid',
        height: '100%',
        minWidth: 0,
        lineHeight: 1.2,
        // The wrapper sets the Style panel's size on the card; the strip is drawn at the day's.
        fontSize: `${tokens.base.toFixed(2)}px`,
        columnGap: `${g.gapPx.toFixed(1)}px`,
        gridTemplateColumns: `${g.whoPx.toFixed(1)}px minmax(0, 1fr)`,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '0.12em', minWidth: 0 }}>
        <b style={{ display: 'flex', alignItems: 'center', gap: '0.35em', fontSize: atLeast(16, 0.62, tokens.base), fontWeight: 750, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          <Backpack size="1em" aria-hidden="true" style={{ flexShrink: 0 }} />
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</span>
        </b>
        <span style={{ fontSize: atLeast(15, 0.54, tokens.base), color: ink(0.6), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {subtitle}
        </span>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${Math.max(1, persons.length)}, minmax(0, 1fr))`,
          columnGap: '0.4em',
          minWidth: 0,
          alignItems: 'center',
        }}
      >
        {persons.map(({ entry, row }) => (
          <div
            key={entry.member.id}
            data-testid="timetable-pack"
            data-member={entry.member.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45em',
              minWidth: 0,
              // The divider runs most of the card's height; the name and the
              // pills sit centred on it and are never clipped top or bottom.
              alignSelf: 'stretch',
              margin: '0.4em 0',
              paddingLeft: '0.8em',
              borderLeft: `1px solid ${ink(0.14)}`,
              lineHeight: 1.2,
            }}
          >
            <span
              aria-hidden="true"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '1.36em',
                height: '1.36em',
                flexShrink: 0,
                borderRadius: '50%',
                fontSize: '0.7em',
                fontWeight: 800,
                lineHeight: 1,
                background: entry.member.color,
                color: memberInk(entry.member.color),
              }}
            >
              {memberInitials(entry.member.name)}
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2em', minWidth: 0 }}>
              <span
                style={{
                  fontSize: atLeast(16, 0.62, tokens.base),
                  fontWeight: 700,
                  color: pickGridTimeColor(entry.member.color, tokens.background),
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {entry.member.name}
              </span>
              <BringPills row={row} tokens={tokens} closedWord />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
