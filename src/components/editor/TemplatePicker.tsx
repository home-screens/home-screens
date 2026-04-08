'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { TEMPLATE_CATALOG, TEMPLATE_CATEGORIES, loadTemplate, getDisplayOrientation } from '@/lib/templates';
import type { TemplateMeta } from '@/lib/templates';
import type { LayoutExport } from '@/types/layout-export';
import { getModuleDefinition } from '@/lib/module-registry';
import { useEditorStore, getActiveDimensions } from '@/stores/editor-store';
import Button from '@/components/ui/Button';

interface TemplatePickerProps {
  onSelect: (layout: LayoutExport) => void;
  onClose: () => void;
}

export default function TemplatePicker({ onSelect, onClose }: TemplatePickerProps) {
  const config = useEditorStore((s) => s.config);
  const selectedDisplayId = useEditorStore((s) => s.selectedDisplayId);
  const [category, setCategory] = useState<string>('All');
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dims = config
    ? getActiveDimensions(config, selectedDisplayId)
    : { width: 1080, height: 1920 };
  const displayWidth = dims.width;
  const displayHeight = dims.height;
  const orientation = getDisplayOrientation(displayWidth, displayHeight);

  const filtered =
    category === 'All'
      ? TEMPLATE_CATALOG
      : TEMPLATE_CATALOG.filter((t) => t.category === category);

  const handleSelect = async (template: TemplateMeta) => {
    setLoading(template.id);
    setError(null);
    try {
      const layout = await loadTemplate(template, orientation);
      onSelect(layout);
    } catch {
      setError(`Failed to load "${template.name}"`);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-black/60">
      <div className="w-full max-w-2xl h-[80vh] rounded-xl border border-neutral-700 bg-neutral-900 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-700 px-5 py-3.5">
          <h2 className="text-lg font-semibold text-neutral-100">Templates</h2>
          <button onClick={onClose} className="text-neutral-500 hover:text-neutral-300">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Category tabs */}
        <div className="flex gap-1 px-5 pt-3 pb-2 overflow-x-auto">
          {TEMPLATE_CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                category === cat
                  ? 'bg-blue-600 text-white'
                  : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {error && (
            <div className="mb-3 rounded-md bg-red-900/30 border border-red-700/50 px-3 py-2 text-xs text-red-300">
              {error}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            {filtered.map((template) => (
              <button
                key={template.id}
                onClick={() => handleSelect(template)}
                disabled={loading === template.id}
                className="text-left rounded-lg border border-neutral-700 bg-neutral-800/50 p-4 hover:border-neutral-500 hover:bg-neutral-800 transition-colors disabled:opacity-50"
              >
                <div className="flex items-start justify-between mb-1.5">
                  <span className="text-sm font-medium text-neutral-200">
                    {template.name}
                  </span>
                  <span className="shrink-0 rounded-full bg-neutral-700/60 px-2 py-0.5 text-[10px] text-neutral-400">
                    {template.category}
                  </span>
                </div>
                <p className="text-xs text-neutral-500 mb-3 line-clamp-2">
                  {template.description}
                </p>
                <div className="flex items-center gap-1.5">
                  {template.moduleTypes.slice(0, 5).map((type) => {
                    const def = getModuleDefinition(type);
                    if (!def) return null;
                    const Icon = def.icon;
                    return (
                      <div
                        key={type}
                        title={def.label}
                        className="rounded bg-neutral-700/50 p-1"
                      >
                        <Icon className="w-3.5 h-3.5 text-neutral-400" />
                      </div>
                    );
                  })}
                  {template.moduleTypes.length > 5 && (
                    <span className="text-[10px] text-neutral-500">
                      +{template.moduleTypes.length - 5}
                    </span>
                  )}
                </div>
                {loading === template.id && (
                  <span className="text-xs text-blue-400 mt-2 block">Loading...</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-neutral-700 px-5 py-3 flex justify-end">
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}
