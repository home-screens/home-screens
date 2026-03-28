'use client';

import { useState } from 'react';
import { useEditorStore } from '@/stores/editor-store';
import type { LayoutExport } from '@/types/layout-export';
import Button from '@/components/ui/Button';

interface LayoutImportModalProps {
  layout: LayoutExport;
  onClose: () => void;
}

export default function LayoutImportModal({
  layout,
  onClose,
}: LayoutImportModalProps) {
  const { config, importLayoutAction, saveConfig } = useEditorStore();
  const [applyVisual, setApplyVisual] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { metadata, screens, visual } = layout;

  // Dimension mismatch check
  const currentWidth = config?.settings.displayWidth ?? 1080;
  const currentHeight = config?.settings.displayHeight ?? 1920;
  const dimensionMismatch =
    metadata.sourceDisplay.width !== currentWidth ||
    metadata.sourceDisplay.height !== currentHeight;

  const handleImport = async () => {
    setError(null);
    try {
      importLayoutAction(layout, { mode: 'add', applyVisual });
      await saveConfig();
      onClose();
    } catch {
      setError('Failed to save — check your connection and try again.');
    }
  };

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md rounded-xl border border-neutral-700 bg-neutral-900 p-6 shadow-2xl">
        <h2 className="text-lg font-semibold text-neutral-100 mb-1">Import Layout</h2>
        {metadata.description && (
          <p className="text-xs text-neutral-500 mb-3">{metadata.description}</p>
        )}

        {/* Preview */}
        <div className="rounded-lg bg-neutral-800/60 border border-neutral-700 p-3 mb-4 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-neutral-200">{metadata.name}</span>
            <span className="text-xs text-neutral-500">
              {new Date(metadata.exportedAt).toLocaleDateString()}
            </span>
          </div>
          <div className="text-xs text-neutral-400 space-y-0.5">
            <p>
              {metadata.screenCount} screen{metadata.screenCount !== 1 ? 's' : ''},{' '}
              {metadata.moduleCount} module{metadata.moduleCount !== 1 ? 's' : ''}
            </p>
            <p>
              Source: {metadata.sourceDisplay.width} x {metadata.sourceDisplay.height}
            </p>
          </div>
          {/* Screen list */}
          <div className="flex flex-wrap gap-1 mt-1">
            {screens.map((s) => (
              <span
                key={s.id}
                className="inline-flex items-center gap-1 rounded-full bg-neutral-700/60 px-2 py-0.5 text-xs text-neutral-300"
              >
                {s.name}
                <span className="text-neutral-500">{s.modules.length}</span>
              </span>
            ))}
          </div>
        </div>

        {/* Dimension warning */}
        {dimensionMismatch && (
          <div className="rounded-md bg-amber-900/30 border border-amber-700/50 px-3 py-2 mb-4">
            <p className="text-xs text-amber-300">
              This layout was designed for{' '}
              {metadata.sourceDisplay.width}x{metadata.sourceDisplay.height} but your
              display is {currentWidth}x{currentHeight}. Modules will be scaled
              automatically but may need fine-tuning.
            </p>
          </div>
        )}

        {/* Visual settings */}
        <label className="flex items-center gap-2.5 mb-5 cursor-pointer">
          <input
            type="checkbox"
            checked={applyVisual}
            onChange={(e) => setApplyVisual(e.target.checked)}
            className="accent-blue-500"
          />
          <div>
            <span className="text-sm text-neutral-200">Apply visual settings</span>
            <p className="text-xs text-neutral-500">
              Rotation: {visual.rotationIntervalMs / 1000}s
              {visual.transitionEffect ? `, transition: ${visual.transitionEffect}` : ''}
            </p>
          </div>
        </label>

        {/* Error */}
        {error && (
          <div className="rounded-md bg-red-900/30 border border-red-700/50 px-3 py-2 mb-4">
            <p className="text-xs text-red-300">{error}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleImport}>
            Import
          </Button>
        </div>
      </div>
    </div>
  );
}
