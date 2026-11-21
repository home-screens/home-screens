'use client';

import { floorEase, type WeatherViewProps } from './weather-view-utils';
import { useElementBox } from '@/hooks/useElementBox';
import { AlertBand } from './weather-parts';
import {
  Hero, HourlyCard, DaysCard, MapCard, Instrument, availableCards,
} from './cards';
import { packCardRows } from './conditions-layout';

/**
 * The phone weather app's page, as a wall.
 *
 * Portrait is the phone: hero, hour strip, day list, the rain map, and two
 * instrument cards. Landscape is the tablet arrangement: the hero across the
 * top, the hour strip beside the map, then the day list, air quality and
 * four instrument cards. The rest of the phone's page is the Conditions
 * view, which rotates in as a second screen. The instrument cards come from
 * the module's card list, in its order: portrait draws the first two, and
 * landscape fills its six cells (eight without the map) from the top of the
 * list, the short middle row first.
 */
export default function ForecastView(p: WeatherViewProps) {
  return p.scale.orientation === 'landscape' ? <ForecastLandscape p={p} /> : <ForecastPortrait p={p} />;
}

function ForecastPortrait({ p }: { p: WeatherViewProps }) {
  const { s, u } = p.scale;
  // The type-unit floors give way near the fit loop's floor (see floorEase).
  const ease = floorEase(p.scale.fit);
  const showMap = p.config.showMap !== false && p.latitude != null && p.longitude != null;
  // The first two cards on the module's list that this wall can fill: the
  // list's order is how the household picks what sits under the map.
  const cards = availableCards(p).slice(0, 2);
  // The bottom row takes whatever the cards above leave, so its cards learn
  // their cell from the row's measured box and size their instruments to it,
  // as the Conditions grid does; the row's height never follows its content.
  // The row is only drawn once a card can be filled, so it is measured
  // through a callback ref: that finds a row that mounts after the first paint.
  const [rowRef, row] = useElementBox('padding');
  const gap = u * 2.2;
  const cell = row.width > 0 ? { width: (row.width - gap * (cards.length - 1)) / cards.length, height: row.height } : {};
  return (
    <>
      <Hero p={p} />
      <AlertBand p={p} />
      <HourlyCard p={p} count={8} />
      {/* The day list takes what the hero, the hours and the map leave and
          sheds days from the end when that is short (see DaysCard), so the
          map can be the phone's near-square card instead of a letterbox. */}
      <DaysCard p={p} style={{ flex: showMap ? 1.2 : 2.2 }} />
      {/* Floors on `s`, not only `u`: the fit loop shrinks structure fastest,
          and a map or a compass sized off `u` alone collapses to a sliver
          beside large type instead of making the loop shrink the type. */}
      {showMap && <MapCard p={p} style={{ flex: 'none', height: Math.max(u * 40, s * 26 * ease) }} />}
      {/* The floor seats a label, an instrument of 14.5 s and the line under it
          (see instrumentSize); the fit loop shrinks the type to make it so.
          This floor does not ease toward the fit floor: the instruments size
          to the row now, and a shorter row only starves them. */}
      {cards.length > 0 && (
        <div ref={rowRef} style={{ flex: 1, minHeight: Math.max(u * 24, s * 27), display: 'grid', gridTemplateColumns: `repeat(${cards.length}, minmax(0, 1fr))`, gap }}>
          {cards.map((card) => <Instrument key={card} p={p} card={card} ctx={{ land: false, ...cell }} />)}
        </div>
      )}
    </>
  );
}

function ForecastLandscape({ p }: { p: WeatherViewProps }) {
  const { u } = p.scale;
  const showMap = p.config.showMap !== false && p.latitude != null && p.longitude != null;
  // The cells to the right of the day list: a short middle row (two cells
  // beside the map, four without it) and four tall cells along the bottom,
  // filled from the top of the module's card list in reading order. Air
  // quality takes two cells wherever it lands, and a card left short of a
  // row widens, the same packing as the Conditions grid; cards past the last
  // cell are not drawn.
  const middleCells = showMap ? 2 : 4;
  const rows = packCardRows(availableCards(p), [middleCells, 4], true);
  // A list short enough to leave the bottom row empty lets the middle row's
  // cards grow down into it, so two cards are two tall cards beside the day
  // list rather than a short row over a blank.
  const growDown = rows.length === 1;
  const placed = rows.flatMap((row, r) => {
    let col = 5;
    return row.cards.map(({ card, span }) => {
      const cell: Cell = { col, span: span * 2, row: r === 0 ? 2 : 3, rows: r === 0 && growDown ? 2 : 1 };
      col += span * 2;
      return { card, cell };
    });
  });
  const gap = u * 2;
  // The grid's rows and columns come from the box it gets, so each card's
  // cell follows from the grid's measured size; the instruments size to it.
  const [gridRef, grid] = useElementBox('padding');
  const cellSize = (cell: Cell) => {
    if (grid.width === 0) return {};
    const colW = (grid.width - gap * 11) / 12;
    const rowsH = grid.height - gap * (LANDSCAPE_ROWS.length - 1);
    const total = LANDSCAPE_ROWS.reduce((a, b) => a + b, 0);
    const share = LANDSCAPE_ROWS.slice(cell.row - 1, cell.row - 1 + cell.rows).reduce((a, b) => a + b, 0);
    return { width: colW * cell.span + gap * (cell.span - 1), height: rowsH * share / total + gap * (cell.rows - 1) };
  };
  return (
    <>
      <Hero p={p} land />
      <AlertBand p={p} />
      <div ref={gridRef} style={{
        flex: 1, minHeight: 0, display: 'grid', gap,
        gridTemplateColumns: 'repeat(12, minmax(0, 1fr))',
        gridTemplateRows: LANDSCAPE_ROWS.map((r) => `minmax(0, ${r}fr)`).join(' '),
      }}>
        <HourlyCard p={p} count={12} style={{ gridColumn: showMap ? '1 / 9' : '1 / 13', gridRow: '1', flex: 'none' }} />
        {showMap && <MapCard p={p} land style={{ gridColumn: '9 / 13', gridRow: '1 / 3' }} />}
        <DaysCard p={p} land style={{ gridColumn: '1 / 5', gridRow: '2 / 4', minHeight: 0 }} />
        {placed.map(({ card, cell }) => (
          <Instrument key={card} p={p} card={card} ctx={{ land: true, ...cellSize(cell) }} style={{ gridColumn: `${cell.col} / ${cell.col + cell.span}`, gridRow: `${cell.row} / ${cell.row + cell.rows}` }} />
        ))}
      </div>
    </>
  );
}

/** A card's place in the tablet grid: its first column, how many it spans, its first row and how many rows. */
interface Cell { col: number; span: number; row: 1 | 2 | 3; rows: 1 | 2 }
/** The tablet grid's row shares: the hour strip, the short middle row, the tall bottom row. */
const LANDSCAPE_ROWS = [212, 170, 308] as const;
