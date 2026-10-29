'use client';

import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, GripVertical, LayoutGrid } from 'lucide-react';
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useSortableSensors } from '@/hooks/useDndSensors';
import Toggle, { Switch } from '@/components/ui/Toggle';
import IconField from '@/components/ui/IconField';
import Glyph from '@/components/ui/Glyph';
import { INPUT_CLASS } from '@/components/ui/input-classes';
import { useTranslate } from '@/i18n';
import { getModuleDefinition } from '@/lib/module-registry';
import { DOCK_PALETTE, dockTileColor, dominantModuleType } from '@/lib/screen-dock';
import type { DockCapacity } from '@/components/modules/DisplayControlModule/metrics';
import type { DockButton, Screen } from '@/types/config';

const KEY = 'configSections.display-control';

interface DockButtonsListProps {
  /** The saved list; undefined means every screen of the rotation. */
  value: DockButton[] | undefined;
  onChange: (next: DockButton[] | undefined) => void;
  /** This display's screens, in editor order, switched-off ones included. */
  screens: readonly Screen[];
  /** How many buttons the module's box holds before the dock scrolls. */
  capacity: DockCapacity;
  /** Icons only: the names threshold does not apply. */
  compact: boolean;
}

/**
 * The dock's buttons as one list under the Dock layout. Off, every screen of
 * the rotation gets a button and the list says how many fit. On, the chosen
 * screens in order: drag to move, open a row to give its tile a name, an
 * icon or a colour, flip its switch to drop it under "Not in the dock",
 * where the display's other screens wait with a switch that adds them.
 * Turning the switch on seeds the list with the switched-on screens as they
 * are, so nothing on the wall changes until a row does.
 */
export function DockButtonsList({ value, onChange, screens, capacity, compact }: DockButtonsListProps) {
  const t = useTranslate('editor');
  const sensors = useSortableSensors();
  const [openId, setOpenId] = useState<string | null>(null);
  const byId = new Map(screens.map((s) => [s.id, s]));
  // A button whose screen was deleted is dropped the first time the list is
  // written again; until then it is simply not shown.
  const chosen = (value ?? []).filter((b) => byId.has(b.screenId));
  const chosenIds = new Set(chosen.map((b) => b.screenId));
  const rest = screens.filter((s) => !chosenIds.has(s.id));
  const enabledCount = screens.filter((s) => s.enabled !== false).length;

  const screenName = (screen: Screen) => {
    const name = screen.name.trim();
    return name || t('screenTabs.newScreenName', { number: screens.indexOf(screen) + 1 });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = chosen.findIndex((b) => b.screenId === active.id);
    const to = chosen.findIndex((b) => b.screenId === over.id);
    if (from < 0 || to < 0) return;
    onChange(arrayMove(chosen, from, to));
  };
  const patch = (screenId: string, changes: Partial<DockButton>) => {
    onChange(chosen.map((b) => (b.screenId === screenId ? pruned({ ...b, ...changes }) : b)));
  };

  return (
    <div className="space-y-2" data-field-id="dockButtons">
      <Toggle
        label={t(`${KEY}.dockButtonsChoose`)}
        checked={value !== undefined}
        onChange={(on) => {
          setOpenId(null);
          onChange(on ? screens.filter((s) => s.enabled !== false).map((s) => ({ screenId: s.id })) : undefined);
        }}
      />
      {value === undefined ? (
        <>
          <p className="text-[11px] text-hs-text-faint leading-relaxed">{t(`${KEY}.dockButtonsEvery`)}</p>
          <FitHint capacity={capacity} count={enabledCount} compact={compact} everyScreen />
        </>
      ) : (
        <>
          <p className="text-[11px] text-hs-text-faint leading-relaxed">{t(`${KEY}.dockButtonsHelp`)}</p>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={chosen.map((b) => b.screenId)} strategy={verticalListSortingStrategy}>
              <ul className="space-y-1" aria-label={t(`${KEY}.dockButtons`)}>
                {chosen.map((button, i) => {
                  const screen = byId.get(button.screenId)!;
                  return (
                    <ChosenRow
                      key={button.screenId}
                      button={button}
                      screen={screen}
                      name={screenName(screen)}
                      position={i + 1}
                      open={openId === button.screenId}
                      onOpen={() => setOpenId(openId === button.screenId ? null : button.screenId)}
                      onRemove={() => onChange(chosen.filter((b) => b.screenId !== button.screenId))}
                      onPatch={(changes) => patch(button.screenId, changes)}
                    />
                  );
                })}
              </ul>
            </SortableContext>
          </DndContext>
          <FitHint capacity={capacity} count={chosen.length} compact={compact} />
          {rest.length > 0 && (
            <>
              <p className="pt-1 text-[10px] uppercase tracking-wide text-hs-text-faint">{t(`${KEY}.dockButtonsOff`)}</p>
              <ul className="space-y-1" aria-label={t(`${KEY}.dockButtonsOff`)}>
                {rest.map((screen) => (
                  <RestRow
                    key={screen.id}
                    screen={screen}
                    name={screenName(screen)}
                    onAdd={() => onChange([...chosen, { screenId: screen.id }])}
                  />
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  );
}

/** Drop the overrides that are back to "unset", so the saved row stays small. */
function pruned(button: DockButton): DockButton {
  const out: DockButton = { screenId: button.screenId };
  const label = button.label?.trim();
  if (label) out.label = button.label;
  if (button.icon) out.icon = button.icon;
  if (button.color) out.color = button.color;
  return out;
}

interface ChosenRowProps {
  button: DockButton;
  screen: Screen;
  name: string;
  position: number;
  open: boolean;
  onOpen: () => void;
  onRemove: () => void;
  onPatch: (changes: Partial<DockButton>) => void;
}

function ChosenRow({ button, screen, name, position, open, onOpen, onRemove, onPatch }: ChosenRowProps) {
  const t = useTranslate('editor');
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: button.screenId });
  const label = button.label?.trim();
  const shown = label || name;
  const color = button.color || dockTileColor(position - 1);
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
    opacity: isDragging ? 0.6 : undefined,
  };
  return (
    <li
      ref={setNodeRef}
      style={style}
      data-screen-id={button.screenId}
      data-on="true"
      className={`rounded-md border bg-hs-card ${open ? 'border-hs-border-strong' : 'border-hs-border'}`}
    >
      <div className="flex items-center gap-1.5 pl-1 pr-2 py-1.5">
        <button
          type="button"
          className="shrink-0 touch-none p-0.5 cursor-grab text-hs-text-faint hover:text-hs-text-muted"
          aria-label={t(`${KEY}.dockButtonDrag`, { name: shown })}
          {...attributes}
          {...listeners}
        >
          <GripVertical size={14} />
        </button>
        <button
          type="button"
          onClick={onOpen}
          aria-expanded={open}
          aria-label={t(`${KEY}.dockButtonOpen`, { name: shown })}
          className="flex flex-1 min-w-0 items-center gap-2 text-left"
        >
          <TilePreview color={color} icon={button.icon} screen={screen} />
          <span className="flex-1 min-w-0 text-xs text-hs-text-body leading-tight">
            <span className="block truncate">{shown}</span>
            {label && label !== name && <span className="block truncate text-[10px] text-hs-text-faint">{name}</span>}
          </span>
          <span className="w-3.5 shrink-0 text-right text-[10px] tabular-nums text-hs-text-faint">{position}</span>
          <span className="shrink-0 text-hs-text-faint">{open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</span>
        </button>
        <Switch checked onChange={onRemove} ariaLabel={shown} />
      </div>
      {open && (
        <div className="space-y-2 border-t border-hs-border px-2 pb-2 pt-2 ml-6">
          <label className="flex flex-col gap-0.5">
            <span className="text-xs text-hs-text-muted">{t(`${KEY}.dockButtonLabel`)}</span>
            <input
              type="text"
              value={button.label ?? ''}
              placeholder={name}
              maxLength={40}
              onChange={(e) => onPatch({ label: e.target.value || undefined })}
              className={INPUT_CLASS}
            />
          </label>
          <IconField
            label={t(`${KEY}.dockButtonIcon`)}
            value={button.icon}
            onChange={(icon) => onPatch({ icon })}
          />
          <div className="flex flex-col gap-1">
            <span className="text-xs text-hs-text-muted">{t(`${KEY}.dockButtonColor`)}</span>
            {/* The panel is narrow and the row sits indented, so the swatches
                wrap and the reset takes its own line rather than running off
                the edge where nothing can click it. */}
            <div className="flex flex-wrap items-center gap-1" role="group" aria-label={t(`${KEY}.dockButtonColor`)}>
              {DOCK_PALETTE.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  aria-label={swatch}
                  aria-pressed={button.color === swatch}
                  onClick={() => onPatch({ color: swatch })}
                  className={`h-[18px] w-[18px] shrink-0 rounded-[5px] border-2 ${button.color === swatch ? 'border-white' : 'border-transparent hover:border-white/50'}`}
                  style={{ background: swatch }}
                />
              ))}
              <label
                className="relative h-[18px] w-[18px] shrink-0 cursor-pointer overflow-hidden rounded-[5px] border-2 border-hs-border-strong"
                style={{ background: 'conic-gradient(#f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)' }}
                title={t(`${KEY}.dockButtonColorAny`)}
              >
                <input
                  type="color"
                  aria-label={t(`${KEY}.dockButtonColorAny`)}
                  value={button.color && /^#[0-9a-fA-F]{6}$/.test(button.color) ? button.color : '#3b82f6'}
                  onChange={(e) => onPatch({ color: e.target.value })}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
              </label>
            </div>
            <button
              type="button"
              disabled={!button.color}
              onClick={() => onPatch({ color: undefined })}
              className="self-start text-[11px] text-hs-accent hover:text-hs-accent-hover disabled:text-hs-text-faint"
            >
              {t(`${KEY}.dockButtonColorOwn`)}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

function RestRow({ screen, name, onAdd }: { screen: Screen; name: string; onAdd: () => void }) {
  const t = useTranslate('editor');
  return (
    <li
      data-screen-id={screen.id}
      data-on="false"
      className="flex items-center gap-1.5 rounded-md border border-hs-border bg-hs-card pl-1 pr-2 py-1.5 opacity-60"
    >
      <span className="shrink-0 p-0.5 text-hs-border-strong"><GripVertical size={14} /></span>
      <TilePreview screen={screen} />
      <span className="flex-1 min-w-0 truncate text-xs text-hs-text-body leading-tight">{name}</span>
      {screen.enabled === false && (
        <span className="shrink-0 rounded-full border border-hs-border-strong px-1.5 text-[9.5px] uppercase tracking-wide text-hs-text-faint">
          {t(`${KEY}.dockButtonsScreenOff`)}
        </span>
      )}
      <Switch checked={false} onChange={onAdd} ariaLabel={name} />
    </li>
  );
}

/** The tile as the wall will draw it: its colour (grey while not in the dock) and its icon. */
function TilePreview({ color, icon, screen }: { color?: string; icon?: string; screen: Screen }) {
  let glyph: ReactNode;
  if (icon) {
    glyph = <Glyph value={icon} pictureSize="14px" />;
  } else {
    const type = dominantModuleType(screen);
    const Icon = (type && getModuleDefinition(type)?.icon) || LayoutGrid;
    glyph = <Icon size={13} strokeWidth={1.75} aria-hidden="true" />;
  }
  return (
    <span
      aria-hidden="true"
      className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md text-[13px] leading-none ${color ? 'text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]' : 'border border-hs-border-strong bg-hs-panel text-hs-text-muted'}`}
      style={color ? { background: color } : undefined}
    >
      {glyph}
    </span>
  );
}

/**
 * How many buttons the dock holds at the module's size, and what the chosen
 * count means: all fit, the names go, or the pill scrolls.
 */
function FitHint({ capacity, count, compact, everyScreen = false }: { capacity: DockCapacity; count: number; compact: boolean; everyScreen?: boolean }) {
  const t = useTranslate('editor');
  const namesApply = !compact && capacity.withNames > 0;
  const base = namesApply
    ? t(`${KEY}.dockFitBase`, { names: capacity.withNames, icons: capacity.iconsOnly })
    : t(`${KEY}.dockFitCompact`, { icons: capacity.iconsOnly });
  let state: string;
  let warn = false;
  if (count > capacity.iconsOnly) {
    state = t(everyScreen ? `${KEY}.dockFitScrollEvery` : `${KEY}.dockFitScroll`, { count });
    warn = true;
  } else if (namesApply && count > capacity.withNames) {
    state = t(`${KEY}.dockFitNoNames`, { count });
    warn = true;
  } else if (count === 1) {
    state = t(`${KEY}.dockFitOne`);
  } else {
    state = t(`${KEY}.dockFitAll`, { count });
  }
  return (
    <p data-testid="dock-fit-hint" data-warn={warn ? 'true' : 'false'} className={`text-[11px] leading-relaxed ${warn ? 'text-hs-warning' : 'text-hs-text-faint'}`}>
      {base} {state}
    </p>
  );
}
