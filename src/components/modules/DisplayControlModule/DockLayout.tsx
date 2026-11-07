'use client';

import { wallPress } from '@/components/modules/shared/wallPress';
import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { LayoutGrid } from 'lucide-react';
import { useTranslate } from '@/i18n';
import { getModuleDefinition } from '@/lib/module-registry';
import { dockTileColor, type DockScreen } from '@/lib/screen-dock';
import Glyph from '@/components/ui/Glyph';
import { useElementBox } from '@/hooks/useElementBox';
import { useEpochMinute } from '@/hooks/useEpochMinute';
import { useBurnInProtection } from '@/components/display/burn-in-context';
import { PIXEL_SHIFT_EDGE_CLEARANCE_PX, WANDER_REACH_X_PX, WANDER_REACH_Y_PX, wanderBetween } from '@/lib/pixel-shift';
import type { LayoutProps } from './types';
import { TargetPicker } from './TargetPicker';
import { HoldConfirmButton } from './HoldConfirmButton';
import { BrightnessPopover } from './BrightnessPopover';
import { controlMetrics, dockMetrics, type DockMetrics } from './metrics';
import { SleepIcon, BrightnessIcon } from './controls';

export interface DockLayoutProps extends LayoutProps {
  /** This display's rotation, in order; empty when nothing rotates here. */
  screens: readonly DockScreen[];
  /** Index into `screens` of the screen showing now; -1 when unknown. */
  activeIndex: number;
  onGoto: (index: number) => void;
  /** Sleep and Brightness after a divider. */
  extras: boolean;
}

/**
 * One tile per screen of this display, tap to jump. A centred frosted pill
 * as wide as its screens, like the macOS dock: the showing screen is full
 * colour with a light ring and a dot under it, the others are dimmed. A tall
 * box lays it down the side with the names to the right. With `extras`,
 * Sleep and Brightness follow a divider at the end, the way the macOS dock
 * keeps the trash apart.
 */
export function DockLayout(props: DockLayoutProps) {
  const t = useTranslate('modules');
  const {
    allowRetargeting, compact, isLegacyMode, availableDisplays, currentTarget, setCurrentTarget, selfId,
    brightness, onSleep, onBrightness, screens, activeIndex, onGoto, extras,
  } = props;
  const [pickerOpen, setPickerOpen] = useState(false);
  const [brightnessOpen, setBrightnessOpen] = useState(false);
  const showPicker = allowRetargeting && !isLegacyMode;
  const [boxRef, box] = useElementBox('padding');
  // The picker row borrows the bar layout's model so it matches the other
  // layouts at the same box; everything else is the dock's own.
  const pm = controlMetrics({ w: box.width, h: box.height, layout: 'bar', compact, showPicker });
  const m = dockMetrics({
    w: box.width,
    h: box.height,
    count: screens.length,
    extras,
    compact,
    pickerH: showPicker ? pm.pickerH + pm.gap : 0,
  });
  const dim = pickerOpen ? 'opacity-35' : '';

  // Burn-in protection: the pill drifts a pixel a minute on the wall's minute
  // tick, as far as the empty space around it allows. The dock is the
  // brightest thing that never changes on a wall, usually shown on every
  // screen, and the whole-wall shift only reaches 6 px, which blurs a tile's
  // edges and leaves its body lit. The long reach runs along the dock, the
  // short one across it.
  //
  // The room on each side is half the spare room in the centring box plus
  // the dock's own margin: the tiles grow to fill the box across the dock
  // until they reach their largest size, so on most docks the margin is all
  // the room there is up and down (a bottom dock). The margin is `m.outer`,
  // or the gap to the picker row on the side next to it. A side whose module
  // edge sits against the screen edge gets no margin: the wall shift already
  // hides a strip there, and a pill drifting into it lost its "showing now"
  // dot under the bottom of a portrait wall. A bottom dock therefore drifts up
  // into its margin and never lower than it rests.
  //
  // Zero until both boxes are measured, since the dock resizes once measured
  // anyway. Nothing is measured while protection is off.
  const protect = useBurnInProtection();
  const [roomRef, room] = useElementBox();
  const [pillRef, pill] = useElementBox('border');
  const boxEl = useRef<HTMLDivElement | null>(null);
  const attachBox = useCallback((el: HTMLDivElement | null) => {
    boxEl.current = el;
    boxRef(el);
  }, [boxRef]);
  const minute = useEpochMinute(protect);
  const [edges, setEdges] = useState<ScreenEdges>(NO_SCREEN_EDGES);
  // Read again each minute as well as on resize: the module can move
  // without changing size.
  useLayoutEffect(() => {
    const el = boxEl.current;
    if (!protect || !el) return;
    const next = screenEdgesOf(el.getBoundingClientRect(), window.innerWidth, window.innerHeight);
    setEdges((prev) => (sameEdges(prev, next) ? prev : next));
  }, [protect, minute, box.width, box.height]);
  const measured = room.width > 0 && pill.width > 0;
  const range = (roomSize: number, pillSize: number, nearMargin: number, farMargin: number, cap: number): [number, number] => {
    if (!measured) return [0, 0];
    const spare = (roomSize - pillSize) / 2;
    const side = (margin: number) => Math.max(0, Math.min(cap, Math.floor(spare + margin)));
    return [-side(nearMargin), side(farMargin)];
  };
  const capX = m.vertical ? WANDER_REACH_Y_PX : WANDER_REACH_X_PX;
  const capY = m.vertical ? WANDER_REACH_X_PX : WANDER_REACH_Y_PX;
  const [loX, hiX] = range(room.width, pill.width, edges.left ? 0 : m.outer, edges.right ? 0 : m.outer, capX);
  const [loY, hiY] = range(room.height, pill.height, edges.top ? 0 : (showPicker ? pm.gap : m.outer), edges.bottom ? 0 : m.outer, capY);
  const wander = protect ? { x: wanderBetween(minute, loX, hiX), y: wanderBetween(minute, loY, hiY) } : null;

  return (
    <div
      ref={attachBox}
      className="h-full w-full flex flex-col"
      style={{ padding: m.outer, gap: pm.gap }}
      data-layout="dock"
    >
      {showPicker && (
        <TargetPicker
          value={currentTarget}
          onChange={(v) => setCurrentTarget(v)}
          options={availableDisplays}
          selfId={selfId}
          onOpenChange={setPickerOpen}
          m={pm}
        />
      )}

      <div
        ref={protect ? roomRef : undefined}
        data-testid="display-control-dock-room"
        className={`relative flex min-h-0 min-w-0 flex-1 items-center justify-center transition-opacity ${dim}`}
      >
        {screens.length === 0 ? (
          <span
            className="whitespace-nowrap text-hs-text-muted"
            style={{ fontSize: Math.max(12, m.label || 14) }}
          >
            {t('display-control.dockEmpty')}
          </span>
        ) : (
          <div
            ref={protect ? pillRef : undefined}
            data-testid="display-control-dock"
            // The pill scrolls along its axis once the tiles pass the floor,
            // so a drag across it must scroll it, not change the screen.
            data-swipe-ignore=""
            className={`flex max-h-full max-w-full overflow-auto border border-white/15 bg-hs-card/60 shadow-[0_10px_30px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl backdrop-saturate-150 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${m.vertical ? 'flex-col items-stretch' : 'flex-row items-end'}`}
            style={{
              gap: m.gap,
              padding: m.vertical ? `${m.padIn}px ${m.padAcross}px` : `${m.padAcross}px ${m.padIn}px`,
              borderRadius: m.pillRadius,
              // A step on the minute, never a glide (see the wall shift).
              transform: wander ? `translate(${wander.x}px, ${wander.y}px)` : undefined,
            }}
          >
            {screens.map((screen, i) => {
              const name = screen.label || screen.name.trim() || t('display-control.unnamedScreen', { number: i + 1 });
              return (
                <DockTile
                  key={screen.id}
                  m={m}
                  name={name}
                  color={screen.color || dockTileColor(i)}
                  active={i === activeIndex}
                  unavailable={screen.unavailable === true}
                  ariaLabel={t('display-control.goTo', { name })}
                  onClick={() => onGoto(i)}
                >
                  {screen.icon
                    ? <OwnGlyph value={screen.icon} size={m.icon} />
                    : <ScreenGlyph type={screen.iconType} size={m.icon} />}
                </DockTile>
              );
            })}

            {extras && (
              <>
                <div
                  aria-hidden="true"
                  className="shrink-0 self-center bg-white/20"
                  style={m.vertical
                    ? { height: 1, width: m.tile * 0.7, marginBlock: m.gap * 0.5 }
                    : { width: 1, height: m.tile * 0.7, marginInline: m.gap * 0.5 }}
                />
                <HoldConfirmButton
                  ariaLabel={t('display-control.sleepHoldHint')}
                  hint={t('display-control.keepHolding')}
                  hintFontSize={Math.max(11, m.label || 13)}
                  onConfirm={onSleep}
                  className={`${ITEM_CLASS} ${m.vertical ? 'flex-row' : 'flex-col'}`}
                  contentClassName={`flex items-center ${m.vertical ? 'flex-row' : 'flex-col'}`}
                  style={itemStyle(m)}
                >
                  <ExtraTile m={m}><SleepIcon size={m.icon} /></ExtraTile>
                  <TileName m={m} name={t('display-control.sleep')} />
                </HoldConfirmButton>
                <button
                  type="button"
                  {...wallPress(`${ITEM_CLASS} ${m.vertical ? 'flex-row' : 'flex-col'}`)}
                  aria-label={t('display-control.brightness')}
                  onClick={() => setBrightnessOpen((v) => !v)}
                  style={itemStyle(m)}
                >
                  <ExtraTile m={m}><BrightnessIcon size={m.icon} /></ExtraTile>
                  <TileName m={m} name={t('display-control.brightness')} />
                </button>
              </>
            )}
          </div>
        )}
        {/* Outside the pill: the pill clips to its box and scrolls, so a
            popover inside it was cut off with its slider out of reach. It
            floats over the dock's own area instead, above a bottom dock and
            beside a side dock. */}
        {brightnessOpen && (
          <div
            data-testid="display-control-dock-popover"
            className={`absolute z-20 ${m.vertical ? 'left-full top-1/2 ml-2 -translate-y-1/2' : 'bottom-full left-1/2 mb-2 -translate-x-1/2'}`}
          >
            <BrightnessPopover
              initial={brightness}
              onCommit={(v) => {
                onBrightness(v);
                setBrightnessOpen(false);
              }}
              onDismiss={() => setBrightnessOpen(false)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

const ITEM_CLASS =
  'relative flex shrink-0 items-center justify-center min-w-0 min-h-0 text-hs-text-primary';

/** Every button takes the same slot, so the tiles sit evenly whatever their names say. */
function itemStyle(m: DockMetrics): CSSProperties {
  return m.vertical ? { width: '100%' } : { width: m.slot, paddingBottom: m.marker + Math.max(3, m.marker * 0.8) };
}

/** A screen's tile: coloured square, name, and the "showing now" dot. */
function DockTile({
  m, name, color, active, unavailable, ariaLabel, onClick, children,
}: {
  m: DockMetrics;
  name: string;
  color: string;
  active: boolean;
  /** Drawn faded and pressing it does nothing (DockScreen.unavailable). */
  unavailable: boolean;
  ariaLabel: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      {...wallPress(`${ITEM_CLASS} ${m.vertical ? 'flex-row justify-start' : 'flex-col'}`)}
      aria-label={ariaLabel}
      aria-current={active ? 'true' : undefined}
      aria-disabled={unavailable ? 'true' : undefined}
      onClick={onClick}
      style={{ ...itemStyle(m), ...(unavailable ? { opacity: 0.35 } : {}) }}
    >
      <span
        className={`flex shrink-0 items-center justify-center text-white ${active ? '' : 'brightness-[.86] saturate-[.78]'}`}
        style={{
          width: m.tile,
          height: m.tile,
          borderRadius: m.radius,
          background: color,
          boxShadow: active
            ? '0 0 0 2px rgba(255,255,255,0.55), 0 4px 12px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.4)'
            : '0 3px 8px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.35)',
        }}
      >
        {children}
      </span>
      <TileName m={m} name={name} />
      <span
        aria-hidden="true"
        className={`rounded-full bg-hs-text-primary ${active ? 'opacity-95' : 'opacity-0'}`}
        style={m.vertical
          ? { position: 'absolute', left: -m.padIn * 0.55, top: '50%', width: m.marker, height: m.marker, marginTop: -m.marker / 2 }
          : { position: 'absolute', bottom: 0, left: '50%', width: m.marker, height: m.marker, marginLeft: -m.marker / 2 }}
      />
    </button>
  );
}

/** Sleep and Brightness tiles: glass rather than a colour, so they read as controls, not screens. */
function ExtraTile({ m, children }: { m: DockMetrics; children: ReactNode }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center border border-white/15 bg-white/10 text-hs-text-primary"
      style={{ width: m.tile, height: m.tile, borderRadius: m.radius }}
    >
      {children}
    </span>
  );
}

function TileName({ m, name }: { m: DockMetrics; name: string }) {
  if (!m.showWords) return null;
  return (
    <span
      className="min-w-0 truncate font-semibold leading-tight"
      style={{
        fontSize: m.label,
        marginTop: m.vertical ? undefined : Math.max(3, m.label * 0.3),
        marginLeft: m.vertical ? m.gap : undefined,
        maxWidth: m.vertical ? undefined : m.slot,
      }}
    >
      {name}
    </span>
  );
}

/** A button's own icon: an emoji, a Font Awesome pick or a household picture, sized like the module icons. */
function OwnGlyph({ value, size }: { value: string; size: number }) {
  return (
    <span
      className="flex items-center justify-center leading-none"
      style={{ fontSize: Math.round(size * 0.92), width: size, height: size }}
      aria-hidden="true"
    >
      <Glyph value={value} pictureSize={`${size}px`} />
    </span>
  );
}

/** The registry icon of the screen's biggest module; the layout grid for an empty screen. */
function ScreenGlyph({ type, size }: { type: DockScreen['iconType']; size: number }) {
  const Icon = (type && getModuleDefinition(type)?.icon) || LayoutGrid;
  return <Icon size={size} strokeWidth={1.75} aria-hidden="true" />;
}

/** Which sides of the dock's module sit against the edge of the screen, where the wall shift hides a strip. */
interface ScreenEdges {
  top: boolean;
  bottom: boolean;
  left: boolean;
  right: boolean;
}

const NO_SCREEN_EDGES: ScreenEdges = { top: false, bottom: false, left: false, right: false };

function screenEdgesOf(r: DOMRect, viewportW: number, viewportH: number): ScreenEdges {
  const c = PIXEL_SHIFT_EDGE_CLEARANCE_PX;
  return { top: r.top < c, bottom: viewportH - r.bottom < c, left: r.left < c, right: viewportW - r.right < c };
}

function sameEdges(a: ScreenEdges, b: ScreenEdges): boolean {
  return a.top === b.top && a.bottom === b.bottom && a.left === b.left && a.right === b.right;
}
