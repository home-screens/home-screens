'use client';

import { useState, useMemo, useRef } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { AnimatePresence, motion } from 'framer-motion';
import { Search, ChevronRight, Puzzle } from 'lucide-react';
import { getModulesByCategory, categorySlug, resolveModuleLabel } from '@/lib/module-registry';
import type { ModuleDefinition } from '@/lib/module-registry';
import { usePluginStore } from '@/stores/plugin-store';
import { useEditorStore } from '@/stores/editor-store';
import { useGuardedAddModule } from '@/hooks/useGuardedAddModule';
import { useTranslate } from '@/i18n';

/** Mirrors the PointerSensor activation constraint in the editor page. */
const DRAG_ACTIVATION_DISTANCE = 5;

function PaletteItem({ definition, displayLabel }: { definition: ModuleDefinition; displayLabel: string }) {
  const t = useTranslate('editor');
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${definition.type}`,
    data: { source: 'palette', moduleType: definition.type },
  });
  const isPlugin = definition.type.startsWith('plugin:');

  // A plain click (or Enter/Space) adds the module at the next free spot on
  // the selected screen; dragging still places it exactly. The PointerSensor
  // only activates after 5px of movement, so a click never starts a drag. A
  // drag that starts and is released back over the item still yields a
  // browser click, so the click path ignores any press that travelled past
  // the activation distance (recorded in the capture phase, the same pattern
  // DraggableModule uses, so dnd-kit's own onPointerDown listener is left
  // alone). Only the pointer sensor is registered on the editor's
  // DndContext, so `listeners` carries no onKeyDown to clash with the
  // keyboard path here.
  const pressRef = useRef<{ x: number; y: number } | null>(null);
  const guardedAdd = useGuardedAddModule();
  const addHere = () => {
    const { selectedScreenId } = useEditorStore.getState();
    if (selectedScreenId) void guardedAdd(selectedScreenId, definition.type);
  };

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onPointerDownCapture={(e) => { pressRef.current = { x: e.clientX, y: e.clientY }; }}
      onClick={(e) => {
        const press = pressRef.current;
        pressRef.current = null;
        if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) >= DRAG_ACTIVATION_DISTANCE) return;
        addHere();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          addHere();
        }
      }}
      data-testid={`palette-${definition.type}`}
      title={t('modulePalette.itemTooltip')}
      className={`flex items-center gap-3 px-3 py-2 rounded-lg bg-hs-card border border-hs-border-strong cursor-grab hover:border-hs-accent/40 transition-colors ${
        isDragging ? 'opacity-50' : ''
      }`}
    >
      <definition.icon className="w-4 h-4 text-hs-text-muted flex-shrink-0" />
      <span className="text-sm text-hs-text-body">{displayLabel}</span>
      {isPlugin && (
        <span className="ml-auto flex items-center gap-1 px-1.5 py-0.5 rounded bg-violet-500/10 border border-violet-500/20" title={t('modulePalette.communityPluginTooltip')}>
          <Puzzle className="w-3 h-3 text-violet-500" />
          <span className="text-[10px] text-violet-500 font-medium">{t('modulePalette.pluginBadge')}</span>
        </span>
      )}
    </div>
  );
}

interface ResolvedModule extends ModuleDefinition {
  displayLabel: string;
}

function CategoryGroup({
  categoryLabel,
  modules,
  open,
  onToggle,
}: {
  categoryLabel: string;
  modules: ResolvedModule[];
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-1.5 w-full px-1 py-1.5 text-left group"
      >
        <ChevronRight
          className={`w-3 h-3 text-hs-text-faint transition-transform duration-200 ${
            open ? 'rotate-90' : ''
          }`}
        />
        <span className="text-[11px] font-semibold text-hs-text-faint uppercase tracking-wider">
          {categoryLabel}
        </span>
        <span className="text-[10px] text-hs-text-faint ml-auto">{modules.length}</span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-1.5 pb-2">
              {modules.map((def) => (
                <PaletteItem key={def.type} definition={def} displayLabel={def.displayLabel} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function ModulePalette() {
  const t = useTranslate('editor');
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  // Subscribe to plugin store size so the palette re-renders when plugins load/unload
  const pluginCount = usePluginStore((s) => s.plugins.size);
  const grouped = useMemo(() => {
    // pluginCount is used as a dependency to invalidate this memo when plugins
    // load/unload, since getModulesByCategory() reads from the mutable registry.
    void pluginCount;
    return getModulesByCategory();
  }, [pluginCount]);

  const resolvedGroups = useMemo(() => {
    const groups: { category: string; categoryLabel: string; modules: ResolvedModule[] }[] = [];
    for (const [category, modules] of grouped) {
      const slug = categorySlug(category);
      const categoryLabel = slug ? t(`registry.categories.${slug}`) : category;
      const resolved: ResolvedModule[] = modules.map((m) => ({
        ...m,
        displayLabel: resolveModuleLabel(m.type, t),
      }));
      groups.push({ category, categoryLabel, modules: resolved });
    }
    return groups;
  }, [grouped, t]);

  const query = search.toLowerCase().trim();

  const filteredGroups = useMemo(() => {
    const result: { category: string; categoryLabel: string; modules: ResolvedModule[] }[] = [];
    for (const group of resolvedGroups) {
      const filtered = query
        ? group.modules.filter(
            (m) =>
              m.displayLabel.toLowerCase().includes(query) ||
              m.type.toLowerCase().includes(query) ||
              group.categoryLabel.toLowerCase().includes(query),
          )
        : group.modules;
      if (filtered.length > 0) {
        result.push({ category: group.category, categoryLabel: group.categoryLabel, modules: filtered });
      }
    }
    return result;
  }, [resolvedGroups, query]);

  return (
    <div className="w-56 flex-shrink-0 bg-hs-panel border-r border-hs-border-strong flex flex-col overflow-hidden">
      <div className="p-3 pb-2 flex flex-col gap-2">
        <div>
          <h3 className="text-xs font-semibold text-hs-text-faint uppercase tracking-wider">
            {t('modulePalette.modulesHeading')}
          </h3>
          <p className="text-[11px] text-hs-text-faint mt-0.5">{t('modulePalette.howToAdd')}</p>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-hs-text-faint" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('modulePalette.searchPlaceholder')}
            className="w-full pl-8 pr-3 py-1.5 text-sm bg-hs-card border border-hs-border-strong rounded-lg text-hs-text-body placeholder:text-hs-text-faint focus:outline-none focus:border-hs-accent"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-3 flex flex-col gap-1">
        {filteredGroups.length === 0 ? (
          <p className="text-xs text-hs-text-faint text-center py-4">{t('modulePalette.noResults')}</p>
        ) : (
          filteredGroups.map(({ category, categoryLabel, modules }) => (
            <CategoryGroup
              key={category}
              categoryLabel={categoryLabel}
              modules={modules}
              open={!collapsed.has(category)}
              onToggle={() =>
                setCollapsed((prev) => {
                  const next = new Set(prev);
                  if (next.has(category)) next.delete(category);
                  else next.add(category);
                  return next;
                })
              }
            />
          ))
        )}
      </div>
    </div>
  );
}
