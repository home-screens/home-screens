'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { Palette } from 'lucide-react';
import { useTranslate } from '@/i18n';
import { resolveSwatches } from '@/lib/calendar-color';
import type { LegendRow } from '@/lib/calendar-legend';
import type { FullscreenThemeTokens } from '@/lib/fullscreen-themes';
import { EVENT_DETAIL_AUTO_DISMISS_MS } from './EventDetailOverlay';
import { daySheetLen as len } from './DaySheetOverlay';
import { WallButton } from './WallButton';
import { WallOverlay, WallSheetPanel } from './WallOverlay';

export type CalendarKeyRow = Extract<LegendRow, { kind: 'source' }>;

/** Public holidays come from the hub, not from a calendar the household set up: they can be hidden, not recoloured. */
const HOLIDAYS_ID = 'holidays';

/** Whether the household may recolour what this row stands for. */
function recolorable(row: CalendarKeyRow): boolean {
  return !row.sourceIds.includes(HOLIDAYS_ID);
}

/**
 * "Calendars": the sheet the colour key opens on the wall, in the day sheet's
 * look. One row per calendar in the key, each with a switch that hides or
 * shows it on this wall and, for a calendar the household set up, a Color
 * button.
 *
 * Color folds the sheet down to that one calendar and its colours, so the
 * wall behind shows: a colour is painted there the moment it is tapped, and
 * it can only be judged against the events it is for. It is saved when the
 * sheet closes, however it closes (Done, a tap outside, or nobody touching
 * it), so the caller saves in `onClose`.
 *
 * Done stays at the foot of the sheet whatever the list holds; a list too
 * long for the screen scrolls between the title and Done, and fades at the
 * edge that has more.
 */
export function WallCalendarsSheet({ rows, hidden, counts, swatches, theme, accentColor, onShow, onColor, onClose }: {
  /** The rows to list, hidden calendars included. */
  rows: readonly CalendarKeyRow[];
  hidden: ReadonlySet<string>;
  /** Events per calendar in what the view shows; absent rows read as none. */
  counts: ReadonlyMap<string, number>;
  /** The household's own colours; absent means the built-in ones. */
  swatches?: string[];
  theme: FullscreenThemeTokens;
  accentColor: string;
  onShow: (row: CalendarKeyRow, shown: boolean) => void;
  /** Paint this colour now; the caller saves when the sheet closes. */
  onColor: (row: CalendarKeyRow, color: string) => void;
  onClose: () => void;
}) {
  const t = useTranslate('modules');
  const tCore = useTranslate('core');
  const palette = resolveSwatches(swatches);
  /** The one calendar whose colours are open; the others fold away while it is. */
  const [openId, setOpenId] = useState<string | null>(null);
  const openRow = rows.find((row) => row.id === openId && recolorable(row));
  const listed = openRow ? [openRow] : rows;

  // A keyboard is rare on a wall, but Escape closes this like any dialog.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') closeRef.current(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Which edges of the list have more beyond them, for the fades.
  const listRef = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState({ above: false, below: false });
  const measure = useCallback(() => {
    const box = listRef.current;
    if (!box) return;
    const next = { above: box.scrollTop > 2, below: box.scrollTop + box.clientHeight < box.scrollHeight - 2 };
    setMore((current) => (current.above === next.above && current.below === next.below ? current : next));
  }, []);
  useLayoutEffect(() => {
    measure();
    const box = listRef.current;
    if (!box || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, [measure, listed.length]);

  const rowBackground = theme.isDark
    ? `color-mix(in srgb, ${theme.text} 5%, ${theme.surface})`
    : `color-mix(in srgb, ${theme.surfaceAlt} 50%, ${theme.surface})`;
  const rowBorder = theme.isDark ? `color-mix(in srgb, ${theme.text} 10%, ${theme.surface})` : theme.borderSubtle;
  const circle = len(62, 34);
  const fade = (edge: 'top' | 'bottom', shown: boolean): CSSProperties => ({
    position: 'absolute', left: 0, right: 0, [edge]: 0, height: len(56, 28), pointerEvents: 'none',
    background: `linear-gradient(to ${edge}, transparent, ${theme.surface})`,
    opacity: shown ? 1 : 0, transition: 'opacity 150ms',
  });

  return (
    <WallOverlay
      label={t('calendar.calendarsSheet.title')}
      onClose={onClose}
      autoCloseMs={EVENT_DETAIL_AUTO_DISMISS_MS}
      testId="wall-calendars-sheet"
      scrim={theme.isDark ? 'rgba(0,0,0,0.62)' : 'rgba(0,0,0,0.52)'}
      style={{ fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif', lineHeight: 1.5, '--ds-u': 'min(1vw, 0.7vh)' } as CSSProperties}
    >
      <WallSheetPanel variant="sheet" theme={theme}>
        <div style={{
          display: 'flex', flexDirection: 'column', boxSizing: 'border-box',
          // The panel is at most 88vh and draws its grabber above this: the
          // rest is ours, so the list is what gives way, never Done.
          maxHeight: 'calc(88vh - 44px)',
          padding: `${len(36, 18)} ${len(56, 20)} ${len(44, 22)}`, borderTop: `12px solid ${accentColor}`,
        }}>
          <div style={{ fontSize: len(22, 12), letterSpacing: '0.14em', textTransform: 'uppercase', color: theme.textMuted, marginBottom: len(10, 6), flexShrink: 0 }}>
            {t('calendar.calendarsSheet.eyebrow')}
          </div>
          <div style={{
            fontFamily: "var(--font-dm-serif), 'DM Serif Display', Georgia, serif",
            fontSize: len(56, 26),
            lineHeight: 1.1,
            fontWeight: 400,
            color: theme.text,
            marginBottom: len(26, 14),
            flexShrink: 0,
          }}>
            {t('calendar.calendarsSheet.title')}
          </div>

          <div style={{ position: 'relative', flex: '1 1 auto', minHeight: 0, display: 'flex' }}>
            <div
              ref={listRef}
              role="list"
              data-testid="wall-calendars-list"
              onScroll={measure}
              style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', scrollbarWidth: 'none', display: 'flex', flexDirection: 'column', gap: len(14, 7) }}
            >
              {listed.map((row) => {
                const isHidden = row.sourceIds.length > 0 && row.sourceIds.every((id) => hidden.has(id));
                const canColor = recolorable(row);
                const open = openRow?.id === row.id;
                const count = row.sourceIds.reduce((sum, id) => sum + (counts.get(id) ?? 0), 0);
                const sub = isHidden
                  ? t('calendar.calendarsSheet.hidden')
                  : open ? t('calendar.calendarsSheet.pickColor') : t('calendar.daySheet.eventCount', { count });
                const dot = (
                  <span aria-hidden="true" style={{
                    width: circle, height: circle, borderRadius: '50%', flexShrink: 0, background: row.color, opacity: isHidden ? 0.45 : 1,
                    border: `4px solid ${theme.surface}`, boxShadow: `0 0 0 2px ${theme.border}`, boxSizing: 'border-box',
                  }} />
                );
                const name = (
                  <span style={{ flex: 1, minWidth: 0, opacity: isHidden ? 0.5 : 1, textAlign: 'left' }}>
                    {/* Up to two lines: a long name beside a long word for Show (German, French) is read whole, not cut. */}
                    <span style={{ display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, fontSize: len(31, 16), fontWeight: 650, lineHeight: 1.15, overflow: 'hidden', overflowWrap: 'anywhere' }}>{row.name}</span>
                    <span style={{ display: 'block', fontSize: len(21, 11), color: theme.textMuted, marginTop: len(3, 2), whiteSpace: 'nowrap' }}>{sub}</span>
                  </span>
                );
                const leftStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: len(18, 9), flex: 1, minWidth: 0, minHeight: len(84, 44) };
                return (
                  <div
                    key={row.id}
                    role="listitem"
                    data-testid="wall-calendar-row"
                    data-calendar-hidden={isHidden ? '' : undefined}
                    style={{ flexShrink: 0, background: rowBackground, border: `1px solid ${rowBorder}`, borderRadius: len(22, 11), color: theme.text }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: len(18, 9), minHeight: len(108, 56), padding: `${len(12, 6)} ${len(20, 10)}` }}>
                      {canColor ? (
                        // The circle, the name and a Color pill are one button: a bare
                        // circle reads as the key's dot, not as something to tap.
                        <WallButton
                          row
                          data-testid="wall-calendar-color"
                          aria-label={t('calendar.calendarsSheet.colorOf', { name: row.name })}
                          aria-expanded={open}
                          onClick={() => setOpenId(open ? null : row.id)}
                          style={{ ...leftStyle, padding: 0, background: 'transparent', border: 0, font: 'inherit', color: 'inherit', cursor: 'pointer', borderRadius: len(16, 8) }}
                        >
                          {dot}
                          {name}
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: len(8, 4), flexShrink: 0,
                            padding: `${len(10, 5)} ${len(18, 9)}`, borderRadius: 999, fontSize: len(22, 12), fontWeight: 600,
                            border: `1px solid ${open ? accentColor : theme.border}`, color: open ? accentColor : theme.text, background: theme.surface,
                          }}>
                            <Palette aria-hidden="true" strokeWidth={2.2} style={{ width: '1.1em', height: '1.1em' }} />
                            {t('calendar.calendarsSheet.color')}
                          </span>
                        </WallButton>
                      ) : (
                        <span style={leftStyle}>{dot}{name}</span>
                      )}
                      <WallButton
                        role="switch"
                        aria-checked={!isHidden}
                        aria-label={t('calendar.calendarsSheet.showName', { name: row.name })}
                        data-testid="wall-calendar-show"
                        onClick={() => onShow(row, isHidden)}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: len(14, 8), flexShrink: 0, cursor: 'pointer',
                          minHeight: 44, padding: `${len(8, 4)} 0 ${len(8, 4)} ${len(12, 6)}`,
                          background: 'transparent', border: 0, font: 'inherit', fontSize: len(22, 12), fontWeight: 600, color: theme.textMuted,
                        }}
                      >
                        {t('calendar.calendarsSheet.show')}
                        <span aria-hidden="true" style={{ width: len(96, 52), height: len(56, 30), borderRadius: 999, position: 'relative', background: isHidden ? theme.border : accentColor, flexShrink: 0 }}>
                          <span style={{
                            position: 'absolute', top: '11%', left: isHidden ? '6%' : '48%', height: '78%', aspectRatio: '1', borderRadius: '50%',
                            background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                          }} />
                        </span>
                      </WallButton>
                    </div>
                    {open && (
                      <div data-testid="wall-calendar-colors" style={{ display: 'grid', gridTemplateColumns: `repeat(${palette.length}, minmax(0, 1fr))`, gap: len(14, 6), padding: `${len(6, 3)} ${len(20, 10)} ${len(24, 12)}` }}>
                        {palette.map((color) => {
                          const current = color === row.color.toLowerCase();
                          return (
                            <WallButton
                              key={color}
                              aria-label={color}
                              aria-pressed={current}
                              onClick={() => onColor(row, color)}
                              style={{
                                width: '100%', maxWidth: 84, aspectRatio: '1', justifySelf: 'center', borderRadius: '50%', padding: 0, border: 0, cursor: 'pointer',
                                background: color,
                                // The ring sits outside the circle, so it never shrinks the colour being judged.
                                boxShadow: current ? `0 0 0 4px ${theme.surface}, 0 0 0 8px ${theme.text}` : undefined,
                              }}
                            />
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <span aria-hidden="true" style={fade('top', more.above)} />
            <span aria-hidden="true" style={fade('bottom', more.below)} />
          </div>

          <div style={{ display: 'flex', gap: len(14, 7), marginTop: len(26, 14), flexShrink: 0 }}>
            {openRow && (
              <WallButton
                data-testid="wall-calendars-all"
                onClick={() => setOpenId(null)}
                style={{ ...footButton(theme), flex: 1, background: theme.surface }}
              >
                {t('calendar.calendarsSheet.allCalendars')}
              </WallButton>
            )}
            <WallButton data-testid="wall-calendars-done" onClick={onClose} style={{ ...footButton(theme), flex: 1 }}>
              {tCore('actions.done')}
            </WallButton>
          </div>
        </div>
      </WallSheetPanel>
    </WallOverlay>
  );
}

function footButton(theme: FullscreenThemeTokens): CSSProperties {
  return {
    display: 'block', background: theme.surfaceAlt, border: `1px solid ${theme.border}`, color: theme.text,
    fontSize: len(28, 15), fontWeight: 600, fontFamily: 'inherit', padding: `${len(22, 12)} 0`,
    borderRadius: 18, textAlign: 'center', cursor: 'pointer', minHeight: 44,
  };
}
