'use client';

import { AlertCircle, Check, RefreshCw } from 'lucide-react';
import { useEditorStore } from '@/stores/editor-store';
import { useTranslate } from '@/i18n';
import Button from '@/components/ui/Button';
import { useRemoteConfigWatch } from '@/hooks/useRemoteConfigWatch';

/**
 * The two buttons that settle a save conflict. Shared by the editor toolbar
 * and the settings header, which otherwise have their own save indicators.
 */
export function SaveConflictNotice() {
  const t = useTranslate('editor');
  const saveConflict = useEditorStore((s) => s.saveConflict);
  const resolveSaveConflict = useEditorStore((s) => s.resolveSaveConflict);
  if (!saveConflict) return null;
  return (
    <span role="alert" className="flex items-center gap-2" data-testid="save-conflict" title={t('page.toolbar.conflict.hint')}>
      <AlertCircle className="w-3.5 h-3.5 text-hs-warning shrink-0" />
      <span className="text-xs text-hs-warning">{t('page.toolbar.conflict.title')}</span>
      <Button variant="secondary" size="sm" onClick={() => { void resolveSaveConflict('theirs'); }}>
        {t('page.toolbar.conflict.loadTheirs')}
      </Button>
      <Button variant="secondary" size="sm" onClick={() => { void resolveSaveConflict('mine').catch(() => {}); }}>
        {t('page.toolbar.conflict.keepMine')}
      </Button>
    </span>
  );
}

/**
 * Toolbar save state. Every state has words: "Unsaved changes" while an edit
 * waits for auto-save, "Saving", "Saved", and on failure the reason inline
 * rather than in a hover tooltip. A conflict (the config changed somewhere
 * else) offers the two ways out; a change noticed while idle offers a reload.
 */
export default function SaveStatus() {
  const t = useTranslate('editor');
  const tCore = useTranslate('core');
  const isDirty = useEditorStore((s) => s.isDirty);
  const isSaving = useEditorStore((s) => s.isSaving);
  const saveError = useEditorStore((s) => s.saveError);
  const saveErrorKind = useEditorStore((s) => s.saveErrorKind);
  const saveConflict = useEditorStore((s) => s.saveConflict);
  const saveConfig = useEditorStore((s) => s.saveConfig);
  const loadConfig = useEditorStore((s) => s.loadConfig);
  const remoteChanged = useRemoteConfigWatch();

  let body: React.ReactNode;
  if (saveConflict) {
    body = <SaveConflictNotice />;
  } else if (saveError) {
    // A validation message names the module and field, so it is shown as
    // is; anything else gets plain words rather than a status code.
    const reason = saveErrorKind === 'validation'
      ? saveError
      : saveErrorKind === 'network'
        ? t('page.toolbar.reasonNetwork')
        : t('page.toolbar.reasonServer');
    body = (
      <span role="alert" className="flex min-w-0 items-center gap-1.5" data-testid="save-failed">
        <AlertCircle className="w-3.5 h-3.5 text-hs-danger shrink-0" />
        <span className="text-xs text-hs-danger whitespace-nowrap">{t('page.toolbar.couldntSave')}</span>
        <span className="max-w-64 truncate text-xs text-hs-text-muted" title={reason}>{reason}</span>
        <Button variant="secondary" size="sm" onClick={() => { void saveConfig().catch(() => {}); }}>
          {t('page.toolbar.retryButton')}
        </Button>
      </span>
    );
  } else if (isSaving) {
    body = <span className="text-xs text-hs-text-faint">{tCore('status.saving')}</span>;
  } else if (isDirty) {
    body = <span className="text-xs text-hs-text-faint" data-testid="save-unsaved">{t('page.toolbar.unsaved')}</span>;
  } else if (remoteChanged) {
    body = (
      <span className="flex items-center gap-1.5" data-testid="save-remote-changed" title={t('page.toolbar.changedElsewhereHint')}>
        <RefreshCw className="w-3.5 h-3.5 text-hs-warning shrink-0" />
        <span className="text-xs text-hs-warning">{t('page.toolbar.changedElsewhere')}</span>
        <Button variant="secondary" size="sm" onClick={() => { void loadConfig(); }}>
          {t('page.toolbar.reloadButton')}
        </Button>
      </span>
    );
  } else {
    body = (
      <>
        <Check className="w-3.5 h-3.5 text-hs-success" />
        <span className="text-xs text-hs-success">{t('common.saved')}</span>
      </>
    );
  }

  return (
    <div className="min-w-24 flex items-center justify-end gap-1.5" aria-live="polite" data-testid="save-status">
      {body}
    </div>
  );
}
