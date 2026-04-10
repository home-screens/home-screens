'use client';

import { useState, useMemo } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { AnimatePresence, motion } from 'framer-motion';
import { Search, ChevronRight, Puzzle } from 'lucide-react';
import { getModulesByCategory } from '@/lib/module-registry';
import type { ModuleDefinition } from '@/lib/module-registry';
import { usePluginStore } from '@/stores/plugin-store';

function PaletteItem({ definition }: { definition: ModuleDefinition }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${definition.type}`,
    data: { source: 'palette', moduleType: definition.type },
  });
  const isPlugin = definition.type.startsWith('plugin:');

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`flex items-center gap-3 px-3 py-2 rounded-lg bg-hs-card border border-hs-border-strong cursor-grab hover:border-hs-accent/40 transition-colors ${
        isDragging ? 'opacity-50' : ''
      }`}
    >
      <definition.icon className="w-4 h-4 text-hs-text-muted flex-shrink-0" />
      <span className="text-sm text-hs-text-body">{definition.label}</span>
      {isPlugin && (
        <span className="ml-auto flex items-center gap-1 px-1.5 py-0.5 rounded bg-violet-500/10 border border-violet-500/20" title="Community plugin">
          <Puzzle className="w-3 h-3 text-violet-500" />
          <span className="text-[10px] text-violet-500 font-medium">Plugin</span>
        </span>
      )}
    </div>
  );
}

function CategoryGroup({
  category,
  modules,
  open,
  onToggle,
}: {
  category: string;
  modules: ModuleDefinition[];
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
          {category}
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
                <PaletteItem key={def.type} definition={def} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function ModulePalette() {
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

  const query = search.toLowerCase().trim();

  const filteredGroups = useMemo(() => {
    const result: [string, ModuleDefinition[]][] = [];
    for (const [category, modules] of grouped) {
      const filtered = query
        ? modules.filter(
            (m) =>
              m.label.toLowerCase().includes(query) ||
              m.type.toLowerCase().includes(query) ||
              category.toLowerCase().includes(query),
          )
        : modules;
      if (filtered.length > 0) {
        result.push([category, filtered]);
      }
    }
    return result;
  }, [grouped, query]);

  return (
    <div className="w-56 flex-shrink-0 bg-hs-panel border-r border-hs-border-strong flex flex-col overflow-hidden">
      <div className="p-3 pb-2 flex flex-col gap-2">
        <h3 className="text-xs font-semibold text-hs-text-faint uppercase tracking-wider">
          Modules
        </h3>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-hs-text-faint" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search modules..."
            className="w-full pl-8 pr-3 py-1.5 text-sm bg-hs-card border border-hs-border-strong rounded-lg text-hs-text-body placeholder:text-hs-text-faint focus:outline-none focus:border-hs-accent"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-3 flex flex-col gap-1">
        {filteredGroups.length === 0 ? (
          <p className="text-xs text-hs-text-faint text-center py-4">No modules found</p>
        ) : (
          filteredGroups.map(([category, modules]) => (
            <CategoryGroup
              key={category}
              category={category}
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
