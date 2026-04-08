'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import type { DisplayNode } from '@/types/config';
import { useEditorStore } from '@/stores/editor-store';
import { useConfirmStore } from '@/stores/confirm-store';

interface IdentitySubtabProps {
  display: DisplayNode;
}

/**
 * Display detail "Identity" — name input, read-only ID, and a danger
 * zone for removing the display. The ID is intentionally non-editable:
 * changing it would break existing kiosk URLs (`/display/<id>`) and the
 * polling Pi keeps using its original ID until reconfigured.
 *
 * The "main" display is removable in theory but the editor-store's
 * `removeDisplay` action hard-blocks deletes for `id === 'main'` (the
 * hub kiosk would otherwise be left orphaned). The Remove button below
 * stays visible-but-disabled for clarity, mirroring the rule from
 * the settings-defaults redesign plan: "main looks identical, delete
 * button present but disabled by the store-level guard."
 */
export default function IdentitySubtab({ display }: IdentitySubtabProps) {
  const router = useRouter();
  const { updateDisplay, removeDisplay, saveConfig } = useEditorStore();
  const [name, setName] = useState(display.name);
  const [saving, setSaving] = useState(false);
  const isMainDisplay = display.id === 'main';

  const handleNameBlur = async () => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== display.name) {
      updateDisplay(display.id, { name: trimmed });
      setSaving(true);
      try {
        await saveConfig();
      } finally {
        setSaving(false);
      }
    }
  };

  const handleDelete = async () => {
    if (isMainDisplay) return;
    const ok = await useConfirmStore
      .getState()
      .confirm(`Remove display "${display.name}"? This deletes its screens.`);
    if (!ok) return;
    setSaving(true);
    try {
      removeDisplay(display.id);
      await saveConfig();
      // Navigate off the now-dead ?section=display&id=<deleted> URL so the
      // user lands on the displays index instead of seeing the parent page's
      // "Display not found" placeholder. Done AFTER saveConfig resolves so
      // a save error leaves the user on the current page with the error
      // surface intact.
      router.push('?section=displays');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="rounded-lg border border-neutral-800 bg-neutral-900/40">
        <div className="px-4 py-3.5 border-b border-neutral-800">
          <label className="block">
            <span className="text-xs text-neutral-400">Display name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={handleNameBlur}
              className="mt-1.5 block w-full rounded-md bg-neutral-800 border border-neutral-700 text-sm text-neutral-200 px-3 py-2 focus:outline-none focus:border-blue-500"
            />
            <p className="text-[11px] text-neutral-500 mt-1.5">
              Shown in the sidebar and on the display kiosk. Auto-saves on blur.
            </p>
          </label>
        </div>
        <div className="px-4 py-3.5">
          <label className="block">
            <span className="text-xs text-neutral-400">Display ID</span>
            <input
              type="text"
              value={display.id}
              disabled
              className="mt-1.5 block w-full rounded-md bg-neutral-800/50 border border-neutral-700 text-sm text-neutral-400 px-3 py-2 font-mono"
            />
            <p className="text-[11px] text-neutral-500 mt-1.5">
              Used in the kiosk URL <code className="text-neutral-400">/display/{display.id}</code>.
              Cannot be changed without reconfiguring the Pi.
            </p>
          </label>
        </div>
      </div>

      <div className="mt-5 rounded-lg border border-red-500/20 bg-red-500/[0.04] p-4">
        <div className="text-sm font-medium text-red-300 mb-1">Danger zone</div>
        <div className="text-xs text-neutral-400 mb-3">
          {isMainDisplay
            ? 'The main display is the hub kiosk and cannot be removed. Removing it would orphan its screens and reset the hub to an unadopted state.'
            : 'Removing a display stops serving it and deletes its screens. The Pi can re-register as unadopted.'}
        </div>
        <button
          type="button"
          onClick={handleDelete}
          disabled={isMainDisplay || saving}
          className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-transparent text-red-400 border border-red-500/30 hover:bg-red-500/10 hover:border-red-500/50 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:border-red-500/30 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Remove {display.name}
        </button>
      </div>
    </>
  );
}
