'use client';

import { useEffect, useState, useMemo } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { AnimatePresence, motion } from 'framer-motion';
import { Search, ChevronRight, Puzzle, PanelLeft, PanelLeftClose } from 'lucide-react';
import { getModulesByCategory, categorySlug, resolveModuleDescription, resolveModuleKeywords, resolveModuleLabel } from '@/lib/module-registry';
import type { ModuleDefinition } from '@/lib/module-registry';
import { usePluginStore } from '@/stores/plugin-store';
import { useEditorStore } from '@/stores/editor-store';
import { useTranslate } from '@/i18n';

/**
 * Lowercase and strip accents, so "cumpleanos" finds "cumpleaños" and a French
 * parent typing "evenements" still finds Calendrier. Applied to both sides of
 * every comparison, which is the only way it works in both directions.
 */
function foldForSearch(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim();
}

function PaletteItem({ definition, displayLabel, description }: { definition: ModuleDefinition; displayLabel: string; description: string }) {
  const t = useTranslate('editor');
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${definition.type}`,
    data: { source: 'palette', moduleType: definition.type },
  });
  const isPlugin = definition.type.startsWith('plugin:');

  // Modules are placed by dragging them onto the screen. Enter/Space is the
  // keyboard equivalent — drag-and-drop is mouse-only, so without it the
  // palette would be unreachable from the keyboard. Only the pointer sensor
  // is registered on the editor's DndContext, so `listeners` carries no
  // onKeyDown to clash with this.
  const addFromKeyboard = () => {
    const { selectedScreenId, addModule } = useEditorStore.getState();
    if (selectedScreenId) addModule(selectedScreenId, definition.type);
  };

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          addFromKeyboard();
        }
      }}
      data-testid={`palette-${definition.type}`}
      title={description || t('modulePalette.itemTooltip')}
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
  /** One plain sentence, shown as the row's hover tooltip. */
  displayDescription: string;
  /** Extra search terms ("trash", "picture"); never rendered. */
  searchKeywords: string;
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
            // `clip`, not `hidden`; see AccordionSection for why.
            className="overflow-clip"
          >
            <div className="flex flex-col gap-1.5 pb-2">
              {modules.map((def) => (
                <PaletteItem
                  key={def.type}
                  definition={def}
                  displayLabel={def.displayLabel}
                  description={def.displayDescription}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function ModulePalette({
  collapsed = false,
  focusCategory,
  onExpand,
  onCollapse,
}: {
  /** Rail mode: a 44px strip of category icons instead of the full list. */
  collapsed?: boolean;
  /** Category the rail was expanded from; reopened if the user had closed it. */
  focusCategory?: string;
  onExpand?: (category?: string) => void;
  onCollapse?: () => void;
} = {}) {
  const t = useTranslate('editor');
  const [search, setSearch] = useState('');
  const [closedCategories, setClosedCategories] = useState<Set<string>>(new Set());
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
        displayDescription: resolveModuleDescription(m.type, t),
        searchKeywords: resolveModuleKeywords(m.type, t),
      }));
      groups.push({ category, categoryLabel, modules: resolved });
    }
    return groups;
  }, [grouped, t]);

  // Expanding from a rail icon must land on that category even if the user
  // had collapsed it earlier.
  useEffect(() => {
    if (!focusCategory) return;
    setClosedCategories((prev) => {
      if (!prev.has(focusCategory)) return prev;
      const next = new Set(prev);
      next.delete(focusCategory);
      return next;
    });
  }, [focusCategory]);

  const query = foldForSearch(search);

  const filteredGroups = useMemo(() => {
    const result: { category: string; categoryLabel: string; modules: ResolvedModule[] }[] = [];
    for (const group of resolvedGroups) {
      const filtered = query
        ? group.modules.filter(
            (m) =>
              foldForSearch(m.displayLabel).includes(query) ||
              foldForSearch(m.type).includes(query) ||
              foldForSearch(group.categoryLabel).includes(query) ||
              // "trash" has to find Garbage Day and "picture" the photo
              // modules; matching names alone sent every such search to
              // "No modules found".
              foldForSearch(m.displayDescription).includes(query) ||
              foldForSearch(m.searchKeywords).includes(query),
          )
        : group.modules;
      if (filtered.length > 0) {
        result.push({ category: group.category, categoryLabel: group.categoryLabel, modules: filtered });
      }
    }
    return result;
  }, [resolvedGroups, query]);

  if (collapsed) {
    // Rail: one icon per category, each opening the full list at that
    // category. The list itself is 224px of a 1280px window, which is most of
    // what a landscape canvas or a zoomed-in portrait one needs.
    return (
      <div
        className="w-11 flex-shrink-0 bg-hs-panel border-r border-hs-border-strong flex flex-col items-center gap-1.5 py-2 overflow-y-auto"
        data-testid="module-palette-rail"
      >
        <button
          type="button"
          onClick={() => onExpand?.()}
          title={t('modulePalette.expandTitle')}
          aria-label={t('modulePalette.expandTitle')}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-hs-accent/35 bg-hs-accent-soft text-hs-accent-hover hover:bg-hs-accent/20 transition-colors"
        >
          <PanelLeft className="h-3.5 w-3.5" />
        </button>
        <div className="my-0.5 h-px w-6 bg-hs-border-strong" />
        {resolvedGroups.map((group) => {
          const Icon = group.modules[0]?.icon;
          if (!Icon) return null;
          return (
            <button
              key={group.category}
              type="button"
              onClick={() => onExpand?.(group.category)}
              title={group.categoryLabel}
              aria-label={group.categoryLabel}
              className="flex h-7 w-7 items-center justify-center rounded-md bg-hs-card text-hs-text-muted hover:bg-hs-hover hover:text-hs-text-body transition-colors"
            >
              <Icon className="h-3.5 w-3.5" />
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => onExpand?.()}
          title={t('modulePalette.searchPlaceholder')}
          aria-label={t('modulePalette.searchPlaceholder')}
          className="mt-auto flex h-7 w-7 items-center justify-center rounded-md text-hs-text-faint hover:bg-hs-hover hover:text-hs-text-body transition-colors"
        >
          <Search className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="w-56 flex-shrink-0 bg-hs-panel border-r border-hs-border-strong flex flex-col overflow-hidden">
      <div className="p-3 pb-2 flex flex-col gap-2">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="text-xs font-semibold text-hs-text-faint uppercase tracking-wider">
              {t('modulePalette.modulesHeading')}
            </h3>
            <p className="text-[11px] text-hs-text-faint mt-0.5">{t('modulePalette.howToAdd')}</p>
          </div>
          {onCollapse && (
            <button
              type="button"
              onClick={onCollapse}
              title={t('modulePalette.collapseTitle')}
              aria-label={t('modulePalette.collapseTitle')}
              data-testid="module-palette-collapse"
              className="-mr-1 rounded p-1 text-hs-text-faint hover:bg-hs-hover hover:text-hs-text-body transition-colors"
            >
              <PanelLeftClose className="h-3.5 w-3.5" />
            </button>
          )}
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
              open={!closedCategories.has(category)}
              onToggle={() =>
                setClosedCategories((prev) => {
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
