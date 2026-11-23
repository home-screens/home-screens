'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import type { DisplayNode } from '@/types/config';
import { useEditorStore } from '@/stores/editor-store';
import { useConfirmStore } from '@/stores/confirm-store';
import { isMainDisplay } from '@/lib/display-filter';
import { useTranslate } from '@/i18n';
import { settingsHref } from '@/lib/settings-route';
import { SETTINGS_INPUT_CLASS } from '@/components/ui/input-classes';
import FieldHint from '@/components/ui/FieldHint';
import Notice from '@/components/ui/Notice';
import Button from '@/components/ui/Button';
import { buildDeleteConfirm } from '@/lib/delete-confirmations';

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
  const t = useTranslate('editor');
  const tCore = useTranslate('core');
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
    const ok = await useConfirmStore.getState().confirm(buildDeleteConfirm({
      verb: 'delete',
      name: display.name,
      consequence: t('settings.perDisplayPage.identity.removeConfirmMessage'),
      confirmLabel: t('settings.perDisplayPage.identity.removeConfirmButton'),
    }, tCore));
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
      router.push(settingsHref({ kind: 'displays' }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="rounded-lg border border-hs-border bg-hs-panel/40">
        <div className="px-4 py-3.5 border-b border-hs-border">
          <label className="block">
            <span className="text-xs text-hs-text-muted">
              {t('settings.perDisplayPage.identity.displayNameLabel')}
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={handleNameBlur}
              className={`mt-1.5 block w-full ${SETTINGS_INPUT_CLASS}`}
            />
            <FieldHint className="mt-1.5">
              {t('settings.perDisplayPage.identity.displayNameHelp')}
            </FieldHint>
          </label>
        </div>
        <div className="px-4 py-3.5">
          <label className="block">
            <span className="text-xs text-hs-text-muted">
              {t('settings.perDisplayPage.identity.displayIdLabel')}
            </span>
            <input
              type="text"
              value={display.id}
              disabled
              className="mt-1.5 block w-full rounded-md bg-hs-hover border border-hs-border-strong text-sm text-hs-text-muted px-3 py-2 font-mono"
            />
            <FieldHint className="mt-1.5">
              {t('settings.perDisplayPage.identity.displayIdHelpPart1')}
              <code className="text-hs-text-muted">/display/{display.id}</code>
              {t('settings.perDisplayPage.identity.displayIdHelpPart2')}
            </FieldHint>
          </label>
        </div>
      </div>

      <Notice
        tone="danger"
        className="mt-5"
        title={t('settings.perDisplayPage.identity.dangerZoneHeading')}
        action={
          <Button variant="danger" size="sm" onClick={handleDelete} disabled={isMain || saving} className="inline-flex items-center gap-1.5">
            <Trash2 className="w-3.5 h-3.5" aria-hidden />
            {t('settings.perDisplayPage.identity.removeButton', { name: display.name })}
          </Button>
        }
      >
        {isMain
          ? t('settings.perDisplayPage.identity.dangerZoneMainHelp')
          : t('settings.perDisplayPage.identity.dangerZoneRemovableHelp')}
      </Notice>
    </>
  );
}
