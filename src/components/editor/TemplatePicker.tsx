'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { TEMPLATE_CATALOG, TEMPLATE_CATEGORIES, loadTemplate, getDisplayOrientation } from '@/lib/templates';
import type { TemplateMeta } from '@/lib/templates';
import type { LayoutExport } from '@/types/layout-export';
import { getModuleDefinition, resolveModuleLabel } from '@/lib/module-registry';
import { useEditorStore, getActiveDimensions } from '@/stores/editor-store';
import { useTranslate } from '@/i18n';
import Button from '@/components/ui/Button';
import ModalPortal from '@/components/ui/ModalPortal';

interface TemplatePickerProps {
  onSelect: (layout: LayoutExport) => void;
  onClose: () => void;
}

export default function TemplatePicker({ onSelect, onClose }: TemplatePickerProps) {
  const tEditor = useTranslate('editor');
  const tCore = useTranslate('core');
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
      setError(tEditor('templatePicker.loadFailed', { name: template.name }));
    } finally {
      setLoading(null);
    }
  };

  return (
    <ModalPortal>
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-black/60" role="dialog" aria-modal="true" aria-label={tEditor('templatePicker.title')}>
      <div className="w-full max-w-2xl h-[80vh] rounded-xl border border-hs-border-strong bg-hs-panel shadow-2xl flex flex-col">
        <div className="flex items-center justify-between border-b border-hs-border-strong px-5 py-3.5">
          <h2 className="text-lg font-semibold text-hs-text-primary">{tEditor('templatePicker.title')}</h2>
          <button onClick={onClose} className="text-hs-text-faint hover:text-hs-text-secondary">
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
                  ? 'bg-hs-accent text-white'
                  : 'bg-hs-card text-hs-text-muted hover:text-hs-text-body'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {error && (
            <div className="mb-3 rounded-md bg-hs-danger/10 border border-hs-danger/30 px-3 py-2 text-xs text-hs-danger">
              {error}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            {filtered.map((template) => (
              <button
                key={template.id}
                onClick={() => handleSelect(template)}
                disabled={loading === template.id}
                className="text-left rounded-lg border border-hs-border-strong bg-hs-hover p-4 hover:bg-hs-active transition-colors disabled:opacity-50"
              >
                <div className="flex items-start justify-between mb-1.5">
                  <span className="text-sm font-medium text-hs-text-body">
                    {template.name}
                  </span>
                  <span className="shrink-0 rounded-full bg-hs-card/60 px-2 py-0.5 text-[10px] text-hs-text-muted">
                    {template.category}
                  </span>
                </div>
                <p className="text-xs text-hs-text-faint mb-3 line-clamp-2">
                  {template.description}
                </p>
                <div className="flex items-center gap-1.5">
                  {template.moduleTypes.slice(0, 5).map((type) => {
                    const def = getModuleDefinition(type);
                    if (!def) return null;
                    const Icon = def.icon;
                    const titleText = resolveModuleLabel(type, tEditor);
                    return (
                      <div
                        key={type}
                        title={titleText}
                        className="rounded bg-hs-hover p-1"
                      >
                        <Icon className="w-3.5 h-3.5 text-hs-text-muted" />
                      </div>
                    );
                  })}
                  {template.moduleTypes.length > 5 && (
                    <span className="text-[10px] text-hs-text-faint">
                      +{template.moduleTypes.length - 5}
                    </span>
                  )}
                </div>
                {loading === template.id && (
                  <span className="text-xs text-hs-accent-hover mt-2 block">{tCore('loading')}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="border-t border-hs-border-strong px-5 py-3 flex justify-end">
          <Button variant="secondary" onClick={onClose}>{tCore('actions.close')}</Button>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}
