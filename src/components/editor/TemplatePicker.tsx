'use client';

import { useState } from 'react';
import { TEMPLATE_CATALOG, TEMPLATE_CATEGORIES, loadTemplate, getDisplayOrientation } from '@/lib/templates';
import type { TemplateMeta } from '@/lib/templates';
import type { LayoutExport } from '@/types/layout-export';
import { getModuleDefinition, resolveModuleLabel } from '@/lib/module-registry';
import { useEditorStore } from '@/stores/editor-store';
import { getActiveDimensions } from '@/lib/editor-multi-display';
import { useTranslate } from '@/i18n';
import ModalFrame, { ModalBody, ModalFooter, ModalHeader, ModalPanel } from '@/components/ui/ModalFrame';
import Notice from '@/components/ui/Notice';

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

  // The catalog's own names are English; the picker shows them in the
  // household's language.
  const nameOf = (template: TemplateMeta) => tEditor(`templatePicker.templates.${template.id}.name`);

  const handleSelect = async (template: TemplateMeta) => {
    setLoading(template.id);
    setError(null);
    try {
      const layout = await loadTemplate(template, orientation);
      onSelect(layout);
    } catch {
      setError(tEditor('templatePicker.loadFailed', { name: nameOf(template) }));
    } finally {
      setLoading(null);
    }
  };

  return (
    <ModalFrame labelledBy="template-picker-title" onClose={onClose} className="w-full max-w-2xl">
      <ModalPanel className="h-[80vh]">
        <ModalHeader titleId="template-picker-title" title={tEditor('templatePicker.title')} onClose={onClose} />

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
              {tEditor(`templatePicker.categories.${cat}`)}
            </button>
          ))}
        </div>

        {/* Grid */}
        <ModalBody className="py-3">
          {error && <Notice tone="danger" role="alert" className="mb-3">{error}</Notice>}
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
                    {nameOf(template)}
                  </span>
                  <span className="shrink-0 rounded-full bg-hs-card/60 px-2 py-0.5 text-[10px] text-hs-text-muted">
                    {tEditor(`templatePicker.categories.${template.category}`)}
                  </span>
                </div>
                <p className="text-xs text-hs-text-faint mb-3 line-clamp-2">
                  {tEditor(`templatePicker.templates.${template.id}.description`)}
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
        </ModalBody>

        <ModalFooter onCancel={onClose} cancelLabel={tCore('actions.close')} />
      </ModalPanel>
    </ModalFrame>
  );
}
