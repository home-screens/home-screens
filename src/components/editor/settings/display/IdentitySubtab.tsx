'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import type { DisplayNode } from '@/types/config';
import { useEditorStore } from '@/stores/editor-store';
import { useConfirmStore } from '@/stores/confirm-store';
import { isMainDisplay } from '@/lib/display-filter';

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
  const isMain = isMainDisplay(display.id);

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
    if (isMain) return;
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
      <div className="rounded-lg border border-hs-border bg-hs-panel/40">
        <div className="px-4 py-3.5 border-b border-hs-border">
          <label className="block">
            <span className="text-xs text-hs-text-muted">Display name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={handleNameBlur}
              className="mt-1.5 block w-full rounded-md bg-hs-card border border-hs-border-strong text-sm text-hs-text-body px-3 py-2 focus:outline-none focus:border-hs-accent"
            />
            <p className="text-[11px] text-hs-text-faint mt-1.5">
              Shown in the sidebar and on the display kiosk. Auto-saves on blur.
            </p>
          </label>
        </div>
        <div className="px-4 py-3.5">
          <label className="block">
            <span className="text-xs text-hs-text-muted">Display ID</span>
            <input
              type="text"
              value={display.id}
              disabled
              className="mt-1.5 block w-full rounded-md bg-hs-hover border border-hs-border-strong text-sm text-hs-text-muted px-3 py-2 font-mono"
            />
            <p className="text-[11px] text-hs-text-faint mt-1.5">
              Used in the kiosk URL <code className="text-hs-text-muted">/display/{display.id}</code>.
              Cannot be changed without reconfiguring the Pi.
            </p>
          </label>
        </div>
      </div>

      <div className="mt-5 rounded-lg border border-hs-danger/20 bg-hs-danger/[0.04] p-4">
        <div className="text-sm font-medium text-hs-danger mb-1">Danger zone</div>
        <div className="text-xs text-hs-text-muted mb-3">
          {isMain
            ? 'The main display is the hub kiosk and cannot be removed. Removing it would orphan its screens and reset the hub to an unadopted state.'
            : 'Removing a display stops serving it and deletes its screens. The Pi can re-register as unadopted.'}
        </div>
        <button
          type="button"
          onClick={handleDelete}
          disabled={isMain || saving}
          className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-transparent text-hs-danger border border-hs-danger/30 hover:bg-hs-danger/10 hover:border-hs-danger/50 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:border-hs-danger/30 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Remove {display.name}
        </button>
      </div>
    </>
  );
}
