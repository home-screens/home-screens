'use client';

import { useState } from 'react';
import { useEditorStore, getActiveScreens } from '@/stores/editor-store';
import Button from '@/components/ui/Button';

interface LayoutExportModalProps {
  onClose: () => void;
  /** Pre-select a single screen (e.g., from right-click "Export This Screen") */
  preSelectedScreenId?: string;
}

export default function LayoutExportModal({ onClose, preSelectedScreenId }: LayoutExportModalProps) {
  const { config, selectedDisplayId, exportLayout } = useEditorStore();
  const screens = config ? getActiveScreens(config, selectedDisplayId) : [];

  const preSelectedScreen = preSelectedScreenId
    ? screens.find((s) => s.id === preSelectedScreenId)
    : undefined;

  const [name, setName] = useState(preSelectedScreen ? preSelectedScreen.name : 'My Layout');
  const [description, setDescription] = useState('');
  const [selectedScreenIds, setSelectedScreenIds] = useState<Set<string>>(
    () => preSelectedScreenId
      ? new Set([preSelectedScreenId])
      : new Set(screens.map((s) => s.id)),
  );

  const toggleScreen = (id: string) => {
    setSelectedScreenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        // Don't allow deselecting all screens
        if (next.size <= 1) return prev;
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedScreenIds.size === screens.length) {
      // Select only first screen (can't have zero)
      setSelectedScreenIds(new Set([screens[0].id]));
    } else {
      setSelectedScreenIds(new Set(screens.map((s) => s.id)));
    }
  };

  const handleExport = () => {
    exportLayout({
      name: name.trim() || 'My Layout',
      description: description.trim() || undefined,
      screenIds: selectedScreenIds.size === screens.length
        ? undefined // all screens — no need to filter
        : Array.from(selectedScreenIds),
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md rounded-xl border border-neutral-700 bg-neutral-900 p-6 shadow-2xl">
        <h2 className="text-lg font-semibold text-neutral-100 mb-4">Export Layout</h2>

        {/* Name */}
        <label className="block text-sm text-neutral-400 mb-1">Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-md bg-neutral-800 border border-neutral-600 px-3 py-2 text-sm text-neutral-200 focus:outline-none focus:border-blue-500 mb-4"
          placeholder="My Layout"
        />

        {/* Description */}
        <label className="block text-sm text-neutral-400 mb-1">Description (optional)</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="w-full rounded-md bg-neutral-800 border border-neutral-600 px-3 py-2 text-sm text-neutral-200 focus:outline-none focus:border-blue-500 mb-4 resize-none"
          placeholder="Family dashboard with weather and calendar"
        />

        {/* Screen selection */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-neutral-400">Screens to include</span>
            {screens.length > 1 && (
              <button
                onClick={toggleAll}
                className="text-xs text-blue-400 hover:text-blue-300"
              >
                {selectedScreenIds.size === screens.length ? 'Deselect all' : 'Select all'}
              </button>
            )}
          </div>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {screens.map((screen) => (
              <label
                key={screen.id}
                className="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 hover:bg-neutral-800 cursor-pointer transition-colors"
              >
                <input
                  type="checkbox"
                  checked={selectedScreenIds.has(screen.id)}
                  onChange={() => toggleScreen(screen.id)}
                  className="accent-blue-500"
                />
                <span className="text-sm text-neutral-200">{screen.name}</span>
                <span className="text-xs text-neutral-500 ml-auto">
                  {screen.modules.length} module{screen.modules.length !== 1 ? 's' : ''}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleExport} disabled={selectedScreenIds.size === 0}>
            Export
          </Button>
        </div>
      </div>
    </div>
  );
}
