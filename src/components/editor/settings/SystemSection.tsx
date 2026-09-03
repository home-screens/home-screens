'use client';

import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import Button from '@/components/ui/Button';
import ChangelogModal from './ChangelogModal';
import Toggle from '@/components/ui/Toggle';
import { useFormattingLocale, useTranslate } from '@/i18n';
import { useSystemActions } from './useSystemActions';

interface Props {
  onUpgrade: (tag: string, currentVersion: string | null) => void;
  onRollback: (tag: string, currentVersion: string | null) => void;
}

/** How many past versions the rollback list offers before "show all". */
const VISIBLE_ROLLBACK_TAGS = 3;

export default function SystemSection({ onUpgrade, onRollback }: Props) {
  const t = useTranslate('editor');
  const locale = useFormattingLocale();
  const [showAllTags, setShowAllTags] = useState(false);
  const {
    versionInfo,
    releases,
    loading,
    checking,
    showChangelog,
    openRelease,
    powerState,
    channel,
    advancedMode,
    updateNotificationEnabled,
    updateNotifSaveError,
    handleCheckUpdates,
    handleOpenChangelog,
    handleOpenRelease,
    handleToggleChannel,
    handleToggleAdvanced,
    handleToggleUpdateNotification,
    handleUpgrade,
    handleRollback,
    handlePowerAction,
    handleCancelUpgrade,
  } = useSystemActions({ onUpgrade, onRollback });

  const allTags = versionInfo?.tags ?? [];
  const visibleTags = showAllTags ? allTags : allTags.slice(0, VISIBLE_ROLLBACK_TAGS);
  const hiddenTagCount = allTags.length - visibleTags.length;

  if (loading) {
    return (
      <div className="text-sm text-hs-text-faint py-8 text-center">
        {t('settings.systemPage.loading')}
      </div>
    );
  }

  if (!versionInfo) {
    return (
      <div className="text-sm text-hs-danger py-8 text-center">
        {t('settings.systemPage.loadFailed')}
      </div>
    );
  }

  const latestIsPrerelease = versionInfo.latest?.includes('-') ?? false;

  return (
    <div className="space-y-0 divide-y divide-hs-border-strong [&>section]:py-5 [&>section:first-child]:pt-0 [&>section:last-child]:pb-0">
      <section data-field-id="system.version">
        <h3 className="text-sm font-medium text-hs-text-secondary mb-3 uppercase tracking-wider">
          {t('settings.systemPage.version.heading')}
        </h3>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-hs-text-primary text-sm">
              {t('settings.systemPage.version.currentLabel', { version: versionInfo.current })}
            </p>
            {/* The commit hash, the git branch and the release channel are
                build details, and "Show advanced options" already describes
                itself as revealing developer-facing controls. They were the
                first three facts on the page for everyone. */}
            {advancedMode && (
              <p className="text-xs text-hs-text-faint mt-0.5 font-mono">
                {versionInfo.currentCommit !== 'unknown' && <>({versionInfo.currentCommit}){' · '}</>}
                {versionInfo.installedVia === 'git'
                  ? t('settings.systemPage.version.branchLabel', { channel: versionInfo.channel })
                  : t('settings.systemPage.version.installedFromRelease')}
                {' · '}
                <button
                  onClick={handleToggleChannel}
                  data-field-id="system.updateChannel"
                  className="text-hs-text-muted hover:text-hs-accent-hover transition-colors"
                >
                  {channel === 'stable'
                    ? t('settings.systemPage.version.stableChannel')
                    : t('settings.systemPage.version.prereleaseChannel')}
                </button>
              </p>
            )}
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleCheckUpdates}
            disabled={checking}
            data-field-id="system.checkForUpdates"
          >
            {checking
              ? t('settings.systemPage.version.checking')
              : t('settings.systemPage.version.checkButton')}
          </Button>
        </div>

        {versionInfo.upgradeRunning && (
          <div className="mt-3 rounded-lg bg-hs-warning/20 border border-hs-warning/30 p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-hs-warning font-medium">
                  {t('settings.systemPage.upgradeInProgress.title')}
                </p>
                <p className="text-xs text-hs-warning/70 mt-0.5">
                  {t('settings.systemPage.upgradeInProgress.help')}
                </p>
              </div>
              <Button
                variant="danger"
                size="sm"
                onClick={handleCancelUpgrade}
              >
                {t('settings.systemPage.upgradeInProgress.cancelButton')}
              </Button>
            </div>
          </div>
        )}

        {versionInfo.updateAvailable && versionInfo.latest && (
          <div className={`mt-3 rounded-lg border p-3 ${
            latestIsPrerelease
              ? 'bg-hs-warning/20 border-hs-warning/30'
              : 'bg-hs-accent-soft border-hs-accent/30'
          }`}>
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-sm font-medium ${
                  latestIsPrerelease ? 'text-hs-warning' : 'text-hs-accent-hover'
                }`}>
                  {latestIsPrerelease
                    ? t('settings.systemPage.updateAvailable.prereleaseTitle', { version: versionInfo.latest })
                    : t('settings.systemPage.updateAvailable.updateTitle', { version: versionInfo.latest })}
                </p>
                <p className={`text-xs mt-0.5 ${
                  latestIsPrerelease ? 'text-hs-warning/70' : 'text-hs-accent-hover/70'
                }`}>
                  {t('settings.systemPage.updateAvailable.currentLine', { version: versionInfo.current })}
                </p>
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={() => handleUpgrade(`v${versionInfo.latest}`)}
              >
                {latestIsPrerelease
                  ? t('settings.systemPage.updateAvailable.installButton')
                  : t('settings.systemPage.updateAvailable.updateButton')}
              </Button>
            </div>
          </div>
        )}

        {!versionInfo.updateAvailable && (
          <p className="text-xs text-hs-success/80 mt-2 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-hs-success inline-block" />
            {t('settings.systemPage.upToDate')}
          </p>
        )}
      </section>

      {/* Update Notification */}
      <section data-field-id="system.updateNotification">
        <h3 className="text-sm font-medium text-hs-text-secondary mb-3 uppercase tracking-wider">
          {t('settings.systemPage.updateNotification.heading')}
        </h3>
        <p className="text-xs text-hs-text-faint mb-3">
          {t('settings.systemPage.updateNotification.description')}
        </p>
        <Toggle
          label={t('settings.systemPage.updateNotification.enableLabel')}
          checked={updateNotificationEnabled}
          onChange={handleToggleUpdateNotification}
        />
        {updateNotifSaveError && (
          <p className="text-xs text-hs-danger mt-2" role="alert">
            {t('common.saveFailed')}
          </p>
        )}
      </section>

      {/* Changelog */}
      <section data-field-id="system.changelog">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-hs-text-secondary uppercase tracking-wider">
            {t('settings.systemPage.changelog.heading')}
          </h3>
          {!showChangelog && (
            <button
              onClick={handleOpenChangelog}
              className="text-xs text-hs-accent hover:text-hs-accent-hover"
            >
              {t('settings.systemPage.changelog.viewButton')}
            </button>
          )}
        </div>

        {showChangelog && (
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {releases.length === 0 ? (
              <p className="text-xs text-hs-text-faint">
                {t('settings.systemPage.changelog.empty')}
              </p>
            ) : (
              releases.map((r) => (
                <button
                  key={r.tag}
                  type="button"
                  onClick={() => handleOpenRelease(r)}
                  className="w-full flex items-center gap-3 rounded-md bg-hs-input border border-hs-border px-3 py-2 text-left transition-colors hover:border-hs-border-strong hover:bg-hs-hover"
                >
                  <span className="text-sm text-hs-text-primary font-mono">{r.tag}</span>
                  {r.published && (
                    <span className="ml-auto text-xs text-hs-text-faint">
                      {new Date(r.published).toLocaleDateString(locale)}
                    </span>
                  )}
                  <ChevronRight className={`w-4 h-4 shrink-0 text-hs-text-faint ${r.published ? '' : 'ml-auto'}`} />
                </button>
              ))
            )}
          </div>
        )}
      </section>

      {/* Version History / Rollback */}
      {versionInfo.tags.length > 0 && (
        <section data-field-id="system.rollback">
          <h3 className="text-sm font-medium text-hs-text-secondary mb-3 uppercase tracking-wider">
            {t('settings.systemPage.history.heading')}
          </h3>
          <p className="text-xs text-hs-text-faint mb-3">
            {t('settings.systemPage.history.help')}
          </p>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {visibleTags.map((tagInfo) => {
              const isCurrent = tagInfo.version === versionInfo.current;
              return (
                <div
                  key={tagInfo.tag}
                  className="flex items-center justify-between rounded-md px-3 py-2 bg-hs-input border border-hs-border"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-hs-text-primary font-mono">{tagInfo.tag}</span>
                    {isCurrent && (
                      <span className="text-[10px] uppercase tracking-wider bg-hs-accent/30 text-hs-accent-hover px-1.5 py-0.5 rounded">
                        {t('settings.systemPage.history.currentBadge')}
                      </span>
                    )}
                  </div>
                  {!isCurrent && (
                    <button
                      onClick={() => handleRollback(tagInfo.tag)}
                      className="text-xs text-hs-text-muted hover:text-hs-warning transition-colors"
                    >
                      {t('settings.systemPage.history.rollback')}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {/* Seventeen equally-weighted Rollback buttons, all the way back to
              v1.0.0, invited a click on any of them. The recent few are the
              ones that can plausibly help; the rest stay reachable with the
              risk stated. */}
          {hiddenTagCount > 0 && (
            <button
              type="button"
              onClick={() => setShowAllTags(true)}
              className="mt-2 text-xs text-hs-accent hover:underline"
            >
              {t('settings.systemPage.history.showAll', { count: versionInfo.tags.length })}
            </button>
          )}
          {showAllTags && (
            <p className="mt-2 text-xs text-hs-text-faint">
              {t('settings.systemPage.history.olderWarning')}
            </p>
          )}
        </section>
      )}

      {/* System Actions */}
      <section>
        <h3 className="text-sm font-medium text-hs-text-secondary mb-3 uppercase tracking-wider">
          {t('settings.systemPage.actions.heading')}
        </h3>
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handlePowerAction('restart-service')}
            disabled={powerState.status !== 'idle'}
            data-field-id="system.restartService"
          >
            {t('settings.systemPage.actions.restartService')}
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => handlePowerAction('reboot')}
            disabled={powerState.status !== 'idle'}
            data-field-id="system.rebootSystem"
          >
            {t('settings.systemPage.actions.rebootSystem')}
          </Button>
        </div>
        {powerState.status === 'ok' && powerState.action === 'restart-service' && (
          <p className="text-xs text-hs-success mt-2">
            {t('settings.systemPage.powerStatus.restartScheduled')}
          </p>
        )}
        {powerState.status === 'ok' && powerState.action === 'reboot' && (
          <p className="text-xs text-hs-success mt-2">
            {t('settings.systemPage.powerStatus.rebootScheduled')}
          </p>
        )}
        {powerState.status === 'error' && (
          <p className="text-xs text-hs-danger mt-2">
            {powerState.message}
          </p>
        )}
        {powerState.status === 'pending' && (
          <p className="text-xs text-hs-text-faint mt-2">
            {t('settings.systemPage.powerStatus.processing')}
          </p>
        )}
        <p className="text-xs text-hs-text-faint mt-2">
          {t('settings.systemPage.actions.help')}
        </p>
      </section>

      {/* Advanced mode */}
      <section>
        <h3 className="text-sm font-medium text-hs-text-secondary mb-3 uppercase tracking-wider">
          {t('settings.systemPage.advanced.heading')}
        </h3>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-hs-text-primary">{t('settings.systemPage.advanced.toggleLabel')}</p>
            <p className="text-xs text-hs-text-faint mt-0.5">
              {t('settings.systemPage.advanced.help')}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={advancedMode}
            onClick={handleToggleAdvanced}
            data-field-id="system.advancedMode"
            className={`relative shrink-0 inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              advancedMode ? 'bg-hs-accent' : 'bg-hs-card border border-hs-border-strong'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                advancedMode ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </section>

      {/* Current Version */}

      {openRelease && (
        <ChangelogModal release={openRelease} onClose={() => handleOpenRelease(null)} />
      )}
    </div>
  );
}
