'use client';

import { useMemo, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { relativeLuminance } from '@/lib/fullscreen-themes';
import type { ModuleInstance, ModuleStyle } from '@/types/config';
import { useTranslate } from '@/i18n';
import { getModuleDefinition } from '@/lib/module-registry';
import { useRotation } from '@/components/display/rotation-context';
import { useModuleSurface } from '@/components/modules/module-surface';
import { ModuleFrameProvider, type ModuleFrame } from '@/components/modules/module-frame';
import { resolveFontStack } from '@/lib/font-registry';
import { wallPressProps } from './wallPress';
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
  mod: Pick<ModuleInstance, 'openButtonScreen' | 'size' | 'config'>;
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
          inkIsLight={(relativeLuminance(style.textColor) ?? 1) > 0.4}
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
