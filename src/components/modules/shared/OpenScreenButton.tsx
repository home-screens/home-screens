'use client';

import { useMemo, useRef, type PointerEvent, type ReactNode } from 'react';
import { ArrowUpRight, ChevronRight } from 'lucide-react';
import { relativeLuminance } from '@/lib/fullscreen-themes';
import type { ModuleInstance, ModuleStyle } from '@/types/config';
import { useTranslate } from '@/i18n';
import { getModuleDefinition } from '@/lib/module-registry';
import { useRotation } from '@/components/display/rotation-context';
import { useModuleSurface } from '@/components/modules/module-surface';
import { ModuleFrameProvider, type ModuleFrame } from '@/components/modules/module-frame';
import { resolveFontStack } from '@/lib/font-registry';
import { openWith } from '@/lib/open-button';
import { TAP_SLOP_PX } from '@/lib/swipe-gesture';
import { wallPressProps, wallRowPress } from './wallPress';
import { PANEL_SECTION_OPEN_BUTTON, revealPanelSection } from '@/components/editor/panel-section-reveal';

/** The gap between the module's content and the pill. */
const BUTTON_GAP_PX = 8;
/** Below this box width the pill shows its icon alone; above it the name, cut with an ellipsis. */
const WORDS_MIN_WIDTH_PX = 120;

/** A step larger than the card's body text and never under 52 px: the one call to action on the card. */
export function openButtonHeightPx(fontSizePx: number): number {
  return Math.max(52, Math.round(3.2 * fontSizePx));
}

/**
 * True when the module hides its tap targets ("Tap on the Wall" off). A
 * module without that switch has no `interactive` key and keeps its button.
 */
export function openButtonHidden(config: Record<string, unknown>): boolean {
  return config.interactive === false;
}

interface OpenButtonSlotProps {
  mod: Pick<ModuleInstance, 'type' | 'openButtonScreen' | 'openWith' | 'size' | 'config'>;
  /** The module's resolved style: the pill takes its ink, font and inset from the card. */
  style: ModuleStyle;
  children: ReactNode;
}

/**
 * The module's box with its open button, when it has one: the module itself,
 * told through `ModuleFrameProvider` how much of its bottom to keep clear,
 * and a pill over that strip, bottom right, that opens the screen the
 * module points at. The target comes from the rotation context (every
 * switched-on screen of the display, with its name and the module that
 * stands for it), so the box never walks screen lists. No target, no
 * rotation context, or a switched-off target: the children alone, exactly as
 * before.
 */
export function OpenButtonSlot({ mod, style, children }: OpenButtonSlotProps) {
  const rotation = useRotation();
  const targetId = openButtonHidden(mod.config) ? undefined : mod.openButtonScreen;
  const target = targetId ? rotation?.allScreens.find((s) => s.id === targetId) ?? null : null;
  const height = openButtonHeightPx(style.fontSize);
  const frame = useMemo<ModuleFrame>(() => ({ reserveBottomPx: height + BUTTON_GAP_PX }), [height]);
  if (!target) return <>{children}</>;
  const inset = Math.max(style.padding, BUTTON_GAP_PX);
  const inkIsLight = (relativeLuminance(style.textColor) ?? 1) > 0.4;
  if (openWith(mod) === 'card') {
    // The whole card is the way in: nothing to make room for, and a small
    // mark in the corner instead of the pill.
    return (
      <>
        {children}
        <OpenScreenCard
          screenId={target.id}
          name={target.name}
          unavailable={target.unavailable === true}
          markSize={height}
          inset={inset}
          radius={style.borderRadius}
          ink={style.textColor}
        />
      </>
    );
  }
  return (
    <ModuleFrameProvider value={frame}>
      {children}
      <div
        data-open-button-slot
        style={{
          position: 'absolute',
          right: inset,
          bottom: inset,
          maxWidth: `calc(100% - ${inset * 2}px)`,
          color: style.textColor,
          fontFamily: resolveFontStack(style.fontFamily) ?? style.fontFamily,
          fontSize: `${style.fontSize}px`,
        }}
      >
        <OpenScreenButton
          screenId={target.id}
          name={target.name}
          iconType={target.iconType}
          unavailable={target.unavailable === true}
          inkIsLight={inkIsLight}
          height={height}
          iconOnly={mod.size.w < WORDS_MIN_WIDTH_PX}
        />
      </div>
    </ModuleFrameProvider>
  );
}

interface OpenScreenButtonProps {
  screenId: string;
  /** The editor's copy: the target is out of reach right now, so the wall shows no button. */
  unavailable?: boolean;
  /** True when the card's text colour is light, so the pill's words go dark. */
  inkIsLight: boolean;
  name: string;
  iconType: ModuleInstance['type'] | null;
  height: number;
  iconOnly: boolean;
}

/**
 * The pill: the target screen's name and an icon from what the screen
 * holds, in the module's own ink. On the wall and in a preview window a tap
 * opens the screen; on the editor canvas it is drawn and inert, so its place
 * can be judged.
 */
export function OpenScreenButton({ screenId, name, iconType, height, iconOnly, inkIsLight, unavailable = false }: OpenScreenButtonProps) {
  const t = useTranslate('modules');
  const rotation = useRotation();
  const surface = useModuleSurface();
  // The editor canvas draws the pill to judge its place; a click there selects
  // the module. A preview window has a rotation of its own, so the pill works
  // there the way the dock's buttons do.
  const live = surface !== 'editor' && !!rotation;
  // A full-screen target is drawn as what it is (a book for the meal
  // planner, a calendar); any other screen gets an "open" arrow, since its
  // biggest module's icon on another card reads as decoration.
  // A chevron for any other screen, after the name, as "go to it".
  const def = iconType ? getModuleDefinition(iconType) : undefined;
  const LeadIcon = def?.category === 'Full Screen' ? def.icon : null;
  const label = t('openButton.open', { name });
  // On the editor canvas a click on the pill selects the module (the click
  // carries on to the canvas) and opens its Open button section.
  const onEditorClick = surface === 'editor' ? () => { setTimeout(() => revealPanelSection(PANEL_SECTION_OPEN_BUTTON), 80); } : undefined;
  // The words on the filled pill: dark on a light ink, light on a dark one.
  const onInk = inkIsLight ? '#111' : '#fff';
  return (
    <button
      type="button"
      {...wallPressProps}
      data-testid="open-screen-button"
      data-screen-id={screenId}
      aria-label={label}
      // Inert only where a click does nothing at all; on the editor canvas it
      // opens the module's Open button section.
      aria-disabled={(!live && surface !== 'editor') || undefined}
      data-unavailable={unavailable ? '' : undefined}
      title={unavailable ? t('openButton.unavailable') : undefined}
      // A tap on the pill is not a tap on the module under it.
      onClick={live ? (e) => { e.stopPropagation(); rotation.showScreen(screenId); } : onEditorClick}
      style={{
        pointerEvents: 'auto',
        opacity: unavailable ? 0.45 : undefined,
        outline: unavailable ? '2px dashed currentColor' : undefined,
        outlineOffset: unavailable ? 3 : undefined,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.45em',
        height,
        maxWidth: '100%',
        fontSize: 'max(20px, 1.25em)',
        padding: iconOnly ? 0 : '0 1.1em 0 0.9em',
        width: iconOnly ? height : undefined,
        justifyContent: 'center',
        borderRadius: 999,
        border: 0,
        // Filled with the card's ink, the way the back chip is filled with the
        // theme's: the one door on the card, readable from the doorway.
        background: 'currentColor',
        color: 'inherit',
        font: 'inherit',
        fontWeight: 700,
        boxShadow: '0 6px 18px rgba(0, 0, 0, 0.18)',
        cursor: live ? 'pointer' : 'default',
        touchAction: 'manipulation',
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45em', color: onInk, maxWidth: '100%' }}>
        {LeadIcon && <LeadIcon size={Math.round(height * 0.5)} strokeWidth={2.4} aria-hidden="true" style={{ flexShrink: 0 }} />}
        {!iconOnly && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>}
        {!LeadIcon && <ChevronRight size={Math.round(height * 0.5)} strokeWidth={2.4} aria-hidden="true" style={{ flexShrink: 0, marginRight: '-0.2em' }} />}
      </span>
    </button>
  );
}

interface OpenScreenCardProps {
  screenId: string;
  name: string;
  /** The editor's copy: the target is out of reach right now, so the wall opens nothing. */
  unavailable: boolean;
  /** The mark's size: the pill's height, so both read the same from the doorway. */
  markSize: number;
  /** The card's inset, where the pill would sit. */
  inset: number;
  /** The card's corner radius, so the pressed tint follows its shape. */
  radius: number;
  /** The card's text colour: the mark and the pressed tint are drawn in it. */
  ink: string;
}

/**
 * A card that opens its screen with a tap anywhere on it (`openWith:
 * 'card'`): a see-through button over the whole box, tinted while pressed,
 * with a small arrow in the corner so a passer-by can tell the card goes
 * somewhere. A sideways swipe that starts on the card still changes screens
 * (the swipe listens on the window), and a drag that happens to end on the
 * card opens nothing. On the editor canvas only the mark is drawn, so a click
 * on the card selects the module and a click on the mark opens its section.
 */
export function OpenScreenCard({ screenId, name, unavailable, markSize, inset, radius, ink }: OpenScreenCardProps) {
  const t = useTranslate('modules');
  const rotation = useRotation();
  const surface = useModuleSurface();
  const down = useRef<{ x: number; y: number } | null>(null);
  const up = useRef<{ x: number; y: number } | null>(null);
  const live = surface !== 'editor' && !!rotation;
  const label = t('openButton.open', { name });
  const mark = (
    <span
      aria-hidden="true"
      data-testid="open-screen-mark"
      style={{
        position: 'absolute',
        right: inset,
        bottom: inset,
        width: markSize,
        height: markSize,
        borderRadius: '50%',
        border: `${Math.max(2, Math.round(markSize / 22))}px solid color-mix(in srgb, ${ink} 32%, transparent)`,
        color: ink,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: unavailable ? 0.45 : undefined,
        outline: unavailable ? '2px dashed currentColor' : undefined,
        outlineOffset: unavailable ? 3 : undefined,
      }}
    >
      <ArrowUpRight size={Math.round(markSize * 0.5)} strokeWidth={2.6} style={{ opacity: 0.72 }} />
    </span>
  );
  if (!live) {
    // The editor canvas and a box with no rotation: the mark alone. On the
    // canvas a click on it opens the module's Open a screen section.
    const onEditorClick = surface === 'editor' ? () => { setTimeout(() => revealPanelSection(PANEL_SECTION_OPEN_BUTTON), 80); } : undefined;
    return (
      <span
        data-testid="open-screen-card"
        data-screen-id={screenId}
        title={unavailable ? t('openButton.unavailable') : undefined}
        onClick={onEditorClick}
        style={{ position: 'absolute', right: 0, bottom: 0, width: markSize + inset * 2, height: markSize + inset * 2, pointerEvents: onEditorClick ? 'auto' : 'none' }}
      >
        {mark}
      </span>
    );
  }
  // Where the finger landed and lifted: a click whose two ends are further
  // apart than a tap's drift was a drag (a swipe that ended on the card).
  const travel = () => {
    const a = down.current, b = up.current;
    return a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0;
  };
  return (
    <button
      type="button"
      {...wallRowPress(undefined, {
        onPointerDown: (e: PointerEvent<HTMLElement>) => { down.current = { x: e.clientX, y: e.clientY }; up.current = null; },
        onPointerUp: (e: PointerEvent<HTMLElement>) => { up.current = { x: e.clientX, y: e.clientY }; },
      })}
      data-testid="open-screen-card"
      data-screen-id={screenId}
      aria-label={label}
      onClick={() => { if (travel() <= TAP_SLOP_PX) rotation.showScreen(screenId); }}
      style={{
        position: 'absolute',
        inset: 0,
        borderRadius: radius,
        border: 0,
        padding: 0,
        margin: 0,
        background: 'transparent',
        color: ink,
        cursor: 'pointer',
        touchAction: 'manipulation',
        pointerEvents: 'auto',
      }}
    >
      {mark}
    </button>
  );
}
