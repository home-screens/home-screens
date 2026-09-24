'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Check, Hand, Ticket } from 'lucide-react';
import type { FamilyMember } from '@/types/family';
import { bonusDisplayOrder, type BonusItem } from '@/lib/chore-bonus';
import { useTranslate } from '@/i18n';
import MemberDot from '../shared/MemberDot';
import AssigneeDot from './AssigneeDot';
import type { ToggleParams } from './helpers';

/** An open sheet closes itself when nobody touches the wall for this long. */
const SHEET_IDLE_MS = 30_000;
/** Portrait shows up to two rows of three; landscape one row of four, so the band never crowds the chores that count. */
const MAX_TILES_PORTRAIT = 6;
const MAX_TILES_LANDSCAPE = 4;

/**
 * Tiles across: two on a portrait wall with few tiles, three with more, one
 * row of four in landscape. Never fewer than that for a short list: one tile
 * stretched across the whole band put its tickets a screen away from its name.
 */
export function bonusColumns(count: number, isLandscape: boolean): number {
  if (isLandscape) return MAX_TILES_LANDSCAPE;
  return count <= 4 ? 2 : 3;
}

/** How the band splits its chores into tiles shown now and the ones behind "+N more". */
export function splitBonusTiles(items: readonly BonusItem[], isLandscape: boolean): { shown: BonusItem[]; hidden: BonusItem[] } {
  const ordered = bonusDisplayOrder(items);
  const max = isLandscape ? MAX_TILES_LANDSCAPE : MAX_TILES_PORTRAIT;
  if (ordered.length <= max) return { shown: ordered, hidden: [] };
  return { shown: ordered.slice(0, max - 1), hidden: ordered.slice(max - 1) };
}

interface TileProps {
  item: BonusItem;
  memberMap: Map<string, FamilyMember>;
  initialsMap: Map<string, string>;
  s: number;
  cols: number;
  allowTouch: boolean;
  /** The wall's today, as `YYYY-MM-DD`. */
  today: string;
  /** A day as a tile names it ("Monday"). */
  formatDay: (date: string) => string;
  onOpenGrab: (item: BonusItem) => void;
  onOpenGrabbed: (item: BonusItem) => void;
  onToggle: (params: ToggleParams) => void;
  /** Drawn on a sheet, whose own ground is the tile colour: the tile needs an edge. */
  inSheet?: boolean;
}

/**
 * One bonus chore. An up-for-grabs tile is open (Grab it), grabbed (the
 * holder's ring; tap to finish or let go) or done (greyed, says who). An
 * everyone-can tile has a ring per person, each its own tap target.
 */
function BonusTile({ item, memberMap, initialsMap, s, cols, allowTouch, today, formatDay, onOpenGrab, onOpenGrabbed, onToggle, inSheet = false }: TileProps) {
  const t = useTranslate('modules');
  const { chore, grab } = item;
  const first = !!grab;
  const done = grab?.status === 'done';
  const holder = grab && grab.status !== 'open' ? memberMap.get(grab.memberId) : undefined;
  const tappable = allowTouch && first && !done;
  // Never under a finger's 44 px, whatever the text size.
  const dot = Math.max(44, 48 * s);
  const open = () => {
    if (!tappable) return;
    if (grab?.status === 'open') onOpenGrab(item);
    else onOpenGrabbed(item);
  };
  return (
    <div
      data-testid={`fcc-bonus-${chore.id}`}
      role={tappable ? 'button' : undefined}
      tabIndex={tappable ? 0 : undefined}
      onClick={open}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') open(); }}
      className={tappable ? 'press-scale' : undefined}
      style={{
        display: 'flex', flexDirection: 'column', gap: 10 * s, padding: `${16 * s}px ${18 * s}px`, minWidth: 0,
        borderRadius: 20 * s, cursor: tappable ? 'pointer' : 'default',
        background: done ? 'transparent' : 'var(--fcc-surface)',
        boxShadow: grab?.status === 'grabbed' && holder ? `inset 0 0 0 ${2 * s}px color-mix(in srgb, ${holder.color} 70%, transparent)` : undefined,
        // On a sheet the subtle border matches the surface on the solid dark
        // themes; the stronger one shows on every theme.
        border: inSheet ? '1px solid var(--fcc-border)' : done ? '1px solid var(--fcc-border-sub)' : 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 * s }}>
        {/* The kind wraps rather than being cut short: long in some languages, narrow at three across. */}
        <span style={{
          display: 'flex', alignItems: 'flex-start', gap: 6 * s, minWidth: 0, fontSize: 16 * s, fontWeight: 800, lineHeight: 1.2,
          letterSpacing: cols > 2 ? '0.03em' : '0.08em', textTransform: 'uppercase',
          color: done || !first ? 'var(--fcc-text-3)' : 'var(--fcc-bonus)',
        }}>
          {first && cols <= 2 && <Hand size={20 * s} strokeWidth={2.2} style={{ flexShrink: 0 }} />}
          <span>{t(first ? 'chore-chart.bonus.upForGrabs' : 'chore-chart.bonus.everyoneCan')}</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 * s, flexShrink: 0, fontSize: 28 * s, fontWeight: 800, lineHeight: 1, color: done ? 'var(--fcc-text-3)' : 'var(--fcc-bonus)', fontVariantNumeric: 'tabular-nums' }}>
          <Ticket size={26 * s} strokeWidth={2.4} />
          {/* "2 each" needs a wide tile; three across, the kind label keeps the room. */}
          {first || cols > 2 ? chore.points : t('chore-chart.bonus.eachTickets', { n: chore.points })}
        </span>
      </div>
      <div style={{
        flex: 1, fontSize: 28 * s, fontWeight: 600, lineHeight: 1.15, overflow: 'hidden',
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        color: done ? 'var(--fcc-text-3)' : 'var(--fcc-text)', textDecoration: done ? 'line-through' : 'none',
      }}>
        {chore.name}
      </div>
      {grab?.status === 'open' && allowTouch && (
        <span style={{
          alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 8 * s, padding: `${6 * s}px ${18 * s}px`,
          border: `${2 * s}px solid var(--fcc-bonus)`, borderRadius: 999, color: 'var(--fcc-bonus)', fontSize: 21 * s, fontWeight: 700,
        }}>
          <Hand size={22 * s} strokeWidth={2.2} />{t('chore-chart.bonus.grab')}
        </span>
      )}
      {holder && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 * s, fontSize: 22 * s, fontWeight: 600, lineHeight: 1.2, color: done ? 'var(--fcc-text-2)' : 'var(--fcc-text)' }}>
          <MemberDot size={dot} color={holder.color} initial={initialsMap.get(holder.id) ?? holder.name[0]} isCompleted={done} />
          <span style={{ minWidth: 0 }}>
            {/* Done on an earlier day this week: say which, or a kid reads it as done today. */}
            {done && grab.date !== today
              ? t('chore-chart.bonus.didItOn', { name: holder.name, day: formatDay(grab.date) })
              : t(done ? 'chore-chart.bonus.didIt' : 'chore-chart.bonus.onIt', { name: holder.name })}
            {!done && allowTouch && (
              <span style={{ display: 'block', fontSize: 18 * s, fontWeight: 500, color: 'var(--fcc-text-2)' }}>{t('chore-chart.bonus.tapWhenDone')}</span>
            )}
          </span>
        </div>
      )}
      {!first && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 * s }}>
          {item.eligibleIds.map((id) => {
            const member = memberMap.get(id);
            if (!member) return null;
            // Done on another day this time round: theirs, but not undone from
            // today's wall (the hub would have nothing to undo), and it says when.
            const doneOn = item.doneOn[id];
            const doneOtherDay = doneOn !== undefined && doneOn !== today;
            return (
              <AssigneeDot
                key={id}
                memberId={id}
                isCompleted={item.doneIds.includes(id)}
                dotSize={dot}
                choreId={chore.id}
                choreName={chore.name}
                memberName={member.name}
                memberColor={member.color}
                initial={initialsMap.get(id) ?? member.name[0]}
                allowTouch={allowTouch && !doneOtherDay}
                onToggle={onToggle}
                doneEarlierLabel={doneOtherDay ? t('chore-chart.bonus.didItOn', { name: member.name, day: formatDay(doneOn) }) : undefined}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * The wall's bonus chores: a dashed band under the family with one tile per
 * chore. Bonus chores only pay tickets, so they sit apart from the list that
 * counts, and a kid walking past sees there are tickets to be had.
 *
 * Room is limited, so tiles are ordered with grabbed chores first (the holder
 * must always reach theirs) and finished ones last; the rest wait behind
 * "+N more", which opens them in a sheet.
 */
export default function BonusBand({
  items,
  s,
  isLandscape,
  allowTouch,
  onOpenMore,
  ...tileProps
}: Omit<TileProps, 'item' | 'cols' | 's' | 'allowTouch'> & {
  items: BonusItem[];
  s: number;
  allowTouch: boolean;
  isLandscape: boolean;
  onOpenMore: (hidden: BonusItem[]) => void;
}) {
  const t = useTranslate('modules');
  if (items.length === 0) return null;
  const { shown, hidden } = splitBonusTiles(items, isLandscape);
  const cols = bonusColumns(shown.length + (hidden.length > 0 ? 1 : 0), isLandscape);

  return (
    <div
      data-testid="fcc-bonus-band"
      style={{
        flexShrink: 0, padding: `${16 * s}px ${16 * s}px ${18 * s}px`, borderRadius: 26 * s,
        border: `${2 * s}px dashed color-mix(in srgb, var(--fcc-bonus) 55%, transparent)`,
        background: 'color-mix(in srgb, var(--fcc-bonus) 6%, transparent)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 * s, padding: `0 ${4 * s}px ${12 * s}px`, minWidth: 0 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 * s, fontSize: 22 * s, fontWeight: 800, letterSpacing: '0.14em', color: 'var(--fcc-bonus)', textTransform: 'uppercase', flexShrink: 0 }}>
          <Hand size={22 * s} strokeWidth={2.2} />{t('chore-chart.bonus.heading')}
        </span>
        {/* "Grab one" is an instruction; a wall nobody can tap should not give it. */}
        {allowTouch && (
          <span style={{ fontSize: 19 * s, color: 'var(--fcc-text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {/* "Grab one" only when there is one to grab. */}
            {t(items.some((item) => item.grab) ? 'chore-chart.bonus.bandHint' : 'chore-chart.bonus.bandHintEach')}
          </span>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 14 * s }}>
        {shown.map((item) => (
          <BonusTile key={item.chore.id} item={item} s={s} cols={cols} allowTouch={allowTouch} {...tileProps} />
        ))}
        {hidden.length > 0 && (
          <button
            type="button"
            data-testid="fcc-bonus-more"
            onClick={() => onOpenMore(hidden)}
            className="press-scale"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 20 * s, border: 'none', cursor: 'pointer',
              background: 'var(--fcc-surface)', fontSize: 24 * s, fontWeight: 700, color: 'var(--fcc-text-2)', minHeight: 120 * s,
            }}
          >
            {t('chore-chart.bonus.more', { n: hidden.length })}
          </button>
        )}
      </div>
    </div>
  );
}

/** Closes a wall sheet after a spell with no touch, so it never sits over the chart all day. */
function useIdleClose(onClose: () => void) {
  // Every touch inside the sheet starts the wait again: it is idle time that
  // closes it, not time since it opened.
  const [touchedAt, setTouchedAt] = useState(0);
  useEffect(() => {
    const id = setTimeout(onClose, SHEET_IDLE_MS);
    return () => clearTimeout(id);
  }, [onClose, touchedAt]);
  return () => setTouchedAt(Date.now());
}

function Sheet({ s, title, subtitle, points, onClose, children, testId, wide = false }: {
  s: number;
  /** Room for more tiles across (the "+N more" sheet on a landscape wall). */
  wide?: boolean;
  title: string;
  subtitle?: string;
  points?: number;
  onClose: () => void;
  children: ReactNode;
  testId: string;
}) {
  const t = useTranslate('modules');
  const touched = useIdleClose(onClose);
  return (
    <div
      onClick={onClose}
      onPointerDown={touched}
      style={{ position: 'absolute', inset: 0, zIndex: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(10, 8, 7, 0.74)' }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid={testId}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: wide ? `min(${1640 * s}px, 94%)` : `min(${900 * s}px, 90%)`, maxHeight: '90%', overflowY: 'auto', padding: `${40 * s}px ${40 * s}px 0`,
          borderRadius: 34 * s, textAlign: 'center',
          // Some themes' surface is see-through (frosted); laid over the
          // theme's solid background the sheet is always opaque.
          backgroundColor: 'var(--fcc-bg)',
          backgroundImage: 'linear-gradient(var(--fcc-surface), var(--fcc-surface))',
          color: 'var(--fcc-text)', boxShadow: '0 30px 80px rgba(0,0,0,0.6)',
        }}
      >
        <div style={{ fontSize: 42 * s, fontWeight: 700 }}>{title}</div>
        {subtitle ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 * s, fontSize: 25 * s, color: 'var(--fcc-text-2)', margin: `${8 * s}px 0 ${30 * s}px` }}>
            <span>{subtitle}</span>
            {points !== undefined && (
              <>
                <span aria-hidden>·</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 * s, color: 'var(--fcc-bonus)', fontWeight: 800 }}>
                  <Ticket size={24 * s} strokeWidth={2.4} />
                  {t(points === 1 ? 'fullscreen-chore-chart.ticketCount' : 'fullscreen-chore-chart.ticketsCount', { count: points })}
                </span>
              </>
            )}
          </div>
        ) : <div style={{ height: 24 * s }} />}
        {children}
        {/* Stays in view when the sheet scrolls, on the sheet's own opaque ground. */}
        <div style={{
          position: 'sticky', bottom: 0, marginTop: 26 * s, paddingBottom: 30 * s,
          backgroundColor: 'var(--fcc-bg)', backgroundImage: 'linear-gradient(var(--fcc-surface), var(--fcc-surface))',
        }}>
          <button
            type="button"
            onClick={onClose}
            style={{ minHeight: 56 * s, padding: `0 ${30 * s}px`, border: 'none', background: 'none', color: 'var(--fcc-text-2)', fontSize: 25 * s, fontWeight: 600, cursor: 'pointer' }}
          >
            {t('chore-chart.bonus.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}

/** "+N more", opened: the bonus chores the band had no room for, as the same tiles. */
export function BonusMoreSheet({ items, s, allowTouch, isLandscape, onClose, ...tileProps }: Omit<TileProps, 'item' | 'cols' | 's' | 'allowTouch'> & {
  items: BonusItem[];
  s: number;
  allowTouch: boolean;
  isLandscape: boolean;
  onClose: () => void;
}) {
  const t = useTranslate('modules');
  // A landscape wall is wide and short: four across keeps a long list to a
  // row or two, rather than a column that scrolls.
  const cols = isLandscape ? Math.min(4, items.length) : Math.min(2, items.length);
  return (
    <Sheet s={s} wide={isLandscape && items.length > 2} title={t('chore-chart.bonus.moreTitle')} onClose={onClose} testId="fcc-bonus-more-sheet">
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 14 * s, textAlign: 'left' }}>
        {items.map((item) => <BonusTile key={item.chore.id} item={item} s={s} cols={cols} allowTouch={allowTouch} inSheet {...tileProps} />)}
      </div>
    </Sheet>
  );
}

/**
 * "Who's grabbing it?": one big ring per person it is open to. Anyone at the
 * grab limit is faded and told which chore they are already holding, so they
 * know what to finish first.
 */
export function GrabPickerSheet({ item, memberMap, initialsMap, s, heldBy, onPick, onClose }: {
  item: BonusItem;
  memberMap: Map<string, FamilyMember>;
  initialsMap: Map<string, string>;
  s: number;
  /** The chore a person is holding when they are at the grab limit, else null. */
  heldBy: (memberId: string) => string | null;
  onPick: (memberId: string) => void;
  onClose: () => void;
}) {
  const t = useTranslate('modules');
  const big = 140 * s;
  return (
    <Sheet s={s} title={t('chore-chart.bonus.whoGrabbing')} subtitle={item.chore.name} points={item.chore.points} onClose={onClose} testId="fcc-grab-picker">
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(3, item.eligibleIds.length)}, minmax(0, 1fr))`, gap: `${24 * s}px ${18 * s}px`, justifyItems: 'center' }}>
        {item.eligibleIds.map((id) => {
          const member = memberMap.get(id);
          if (!member) return null;
          const held = heldBy(id);
          return (
            <button
              key={id}
              type="button"
              disabled={!!held}
              data-testid={`fcc-grab-pick-${id}`}
              onClick={() => onPick(id)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 * s, background: 'none', border: 'none',
                color: 'var(--fcc-text)', fontSize: 26 * s, fontWeight: 600, cursor: held ? 'default' : 'pointer',
              }}
            >
              <span style={{ opacity: held ? 0.35 : 1 }}>
                <MemberDot size={big} color={member.color} initial={initialsMap.get(id) ?? member.name[0]} isCompleted={false} />
              </span>
              <span style={{ opacity: held ? 0.6 : 1 }}>{member.name}</span>
              {held && (
                <span style={{ fontSize: 19 * s, fontWeight: 600, color: 'var(--fcc-text-2)', marginTop: -6 * s, maxWidth: big * 1.3 }}>
                  {t('chore-chart.bonus.hasOneNamed', { chore: held })}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}

/** A grabbed tile, tapped: the holder finishes it, or lets it go. The wall cannot tell who is standing there. */
export function GrabbedSheet({ item, holder, s, onDone, onLetGo, onClose }: {
  item: BonusItem;
  holder: FamilyMember;
  s: number;
  onDone: () => void;
  onLetGo: () => void;
  onClose: () => void;
}) {
  const t = useTranslate('modules');
  const button = { width: '100%', minHeight: 84 * s, borderRadius: 22 * s, fontSize: 30 * s, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14 * s } as const;
  return (
    <Sheet s={s} title={item.chore.name} subtitle={t('chore-chart.bonus.onIt', { name: holder.name })} points={item.chore.points} onClose={onClose} testId="fcc-grabbed-sheet">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 * s }}>
        <button type="button" data-testid="fcc-grab-done" onClick={onDone} style={{ ...button, border: 'none', background: holder.color, color: '#0c0a09' }}>
          <Check size={34 * s} strokeWidth={3} />{t('chore-chart.bonus.didIt', { name: holder.name })}
        </button>
        {/* Outlined on the theme's own background, so it reads as a button on every theme. */}
        <button type="button" data-testid="fcc-grab-let-go" onClick={onLetGo} style={{ ...button, background: 'var(--fcc-bg)', border: `${2 * s}px solid var(--fcc-border)`, color: 'var(--fcc-text)' }}>
          {t('chore-chart.bonus.letGo')}
        </button>
      </div>
    </Sheet>
  );
}
