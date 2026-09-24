'use client';

import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import Button from '@/components/ui/Button';
import ChangelogModal from './ChangelogModal';
import AutoUpdateSection from './AutoUpdateSection';
import Toggle from '@/components/ui/Toggle';
import { useFormattingLocale, useTranslate } from '@/i18n';
import { formatDateInTZ } from '@/lib/timezone';
import { useEditorHouseholdTimezone } from '@/components/editor/useEditorHouseholdClock';
import { UPDATE_CHANNELS, classifyVersion, compareSemver, type UpdateChannel } from '@/lib/semver';
import { isDowngradeBlocked, lowestUnmetFloor } from '@/lib/update-policy';
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
  const timezone = useEditorHouseholdTimezone();
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
    autoUpdate,
    autoUpdateSaveError,
    handleCheckUpdates,
    handleOpenChangelog,
    handleOpenRelease,
    handleSetChannel,
    handleToggleAdvanced,
    handleToggleUpdateNotification,
    handleToggleAutoUpdate,
    handleSetAutoUpdateTime,
    handleUpgrade,
    handleRollback,
    handleDismissFailedUpdate,
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

  // The banner's tone follows what the channel resolved, not the size of
  // the number: a nightly user stepping back to the normal channel is offered
  // a lower version and the copy has to say so.
  const offeredChannels = UPDATE_CHANNELS.filter(
    (option) => option !== 'nightly' || advancedMode || channel === 'nightly',
  );
  const latestChannel = versionInfo.latest ? classifyVersion(versionInfo.latest) : 'stable';
  const bannerTone: 'update' | 'downgrade' | 'rc' | 'beta' | 'nightly' = versionInfo.isDowngrade
    ? 'downgrade'
    : latestChannel === 'stable'
      ? 'update'
      : latestChannel;
  const bannerIsWarning = bannerTone !== 'update';
  const BANNER_TITLE_KEY: Record<typeof bannerTone, string> = {
    update: 'settings.systemPage.updateAvailable.updateTitle',
    downgrade: 'settings.systemPage.updateAvailable.downgradeTitle',
    rc: 'settings.systemPage.updateAvailable.rcTitle',
    beta: 'settings.systemPage.updateAvailable.betaTitle',
    nightly: 'settings.systemPage.updateAvailable.nightlyTitle',
  };
  const bannerTitle = versionInfo.latest
    ? t(BANNER_TITLE_KEY[bannerTone], { version: versionInfo.latest })
    : '';
  // A required step says what is waiting behind it, so pressing Update
  // twice in a row reads as the plan rather than a surprise.
  const bannerLine = bannerTone === 'downgrade'
    ? t('settings.systemPage.updateAvailable.downgradeLine', { version: versionInfo.current })
    : versionInfo.requiredStepFor && versionInfo.latest
      ? t('settings.systemPage.updateAvailable.stepLine', { version: versionInfo.latest, next: versionInfo.requiredStepFor })
      : t('settings.systemPage.updateAvailable.currentLine', { version: versionInfo.current });
  // The two cases where the channel has something newer or older but nothing
  // may be offered: the step it needs is missing, or the step back would
  // strand the saved settings. Both explain instead of showing a button.
  const withheld: { title: string; line: string } | null = versionInfo.missingStep && versionInfo.requiredStepFor
    ? {
        title: t('settings.systemPage.updateAvailable.stepMissingTitle', { next: versionInfo.requiredStepFor }),
        line: t('settings.systemPage.updateAvailable.stepMissingLine', { next: versionInfo.requiredStepFor, version: versionInfo.missingStep }),
      }
    : versionInfo.blockedDowngrade
      ? {
          title: t('settings.systemPage.updateAvailable.blockedDowngradeTitle', { version: versionInfo.blockedDowngrade }),
          line: t('settings.systemPage.updateAvailable.blockedDowngradeLine', { version: versionInfo.blockedDowngrade }),
        }
      : null;
  // The schema stamped on the saved config is what the running build reads,
  // so a history row's declared schema is judged against the current build's.
  const localSchema = versionInfo.localSchema;
  const bannerButton = bannerTone === 'downgrade'
    ? t('settings.systemPage.updateAvailable.switchButton')
    : bannerTone === 'update'
      ? t('settings.systemPage.updateAvailable.updateButton')
      : t('settings.systemPage.updateAvailable.installButton');

  return (
    <div className="space-y-0 divide-y divide-hs-border-strong [&>section]:py-5 [&>section:first-child]:pt-0 [&>section:last-child]:pb-0">
      <section data-field-id="system.version">
        <h3 className="text-sm font-medium text-hs-text-secondary mb-3 uppercase tracking-wider">
          {t('settings.systemPage.version.heading')}
        </h3>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-hs-text-primary text-sm flex items-center gap-2 flex-wrap">
              <span>{t('settings.systemPage.version.currentLabel', { version: versionInfo.current })}</span>
              {/* A prerelease build says so next to its number, so a bug
                  report screenshot from a test build is readable at a glance. */}
              {versionInfo.currentChannel !== 'stable' && (
                <span
                  data-testid="system-build-badge"
                  className="text-[10px] uppercase tracking-wider bg-hs-warning/20 text-hs-warning px-1.5 py-0.5 rounded"
                >
                  {t(`settings.systemPage.version.${versionInfo.currentChannel}BuildBadge`)}
                </span>
              )}
            </p>
            {/* The commit hash and the git branch are build details, and
                "Show advanced options" already describes itself as revealing
                developer-facing controls. They were the first facts on the
                page for everyone. */}
            {advancedMode && (
              <p className="text-xs text-hs-text-faint mt-0.5 font-mono">
                {versionInfo.currentCommit !== 'unknown' && <>({versionInfo.currentCommit}){' · '}</>}
                {versionInfo.installedVia === 'git'
                  ? t('settings.systemPage.version.branchLabel', { branch: versionInfo.branch })
                  : t('settings.systemPage.version.installedFromRelease')}
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
          <div
            data-testid="system-update-banner"
            className={`mt-3 rounded-lg border p-3 ${
              bannerIsWarning
                ? 'bg-hs-warning/20 border-hs-warning/30'
                : 'bg-hs-accent-soft border-hs-accent/30'
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className={`text-sm font-medium ${
                  bannerIsWarning ? 'text-hs-warning' : 'text-hs-accent-hover'
                }`}>
                  {bannerTitle}
                </p>
                <p className={`text-xs mt-0.5 ${
                  bannerIsWarning ? 'text-hs-warning/70' : 'text-hs-accent-hover/70'
                }`}>
                  {bannerLine}
                </p>
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={() => handleUpgrade(`v${versionInfo.latest}`)}
              >
                {bannerButton}
              </Button>
            </div>
          </div>
        )}

        {withheld && (
          <div
            data-testid="system-update-withheld"
            className="mt-3 rounded-lg border p-3 bg-hs-warning/20 border-hs-warning/30"
          >
            <p className="text-sm font-medium text-hs-warning">{withheld.title}</p>
            <p className="text-xs mt-0.5 text-hs-warning/70">{withheld.line}</p>
          </div>
        )}

        {!versionInfo.updateAvailable && !withheld && (
          <p className="text-xs text-hs-success/80 mt-2 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-hs-success inline-block" />
            {t('settings.systemPage.upToDate')}
          </p>
        )}

        {versionInfo.lastFailedUpdate && (
          <div
            data-testid="system-failed-update"
            className="mt-3 rounded-lg border p-3 bg-hs-input border-hs-border flex items-start justify-between gap-3"
          >
            <p className="text-xs text-hs-text-secondary">
              {t('settings.systemPage.failedUpdate.line', {
                tag: versionInfo.lastFailedUpdate.tag,
                version: versionInfo.current,
              })}
            </p>
            <button
              type="button"
              onClick={handleDismissFailedUpdate}
              className="text-xs text-hs-text-muted hover:text-hs-text-primary transition-colors shrink-0"
            >
              {t('settings.systemPage.failedUpdate.dismiss')}
            </button>
          </div>
        )}
      </section>

      {/* Which builds the update check offers. Normal, Early access and Beta
          are for everyone: candidates and betas exist to get ordinary homes
          onto them early. Test builds are a developer control and hide
          behind advanced mode, except that a device already on them keeps
          the option visible so it can always be switched off. */}
      <section data-field-id="system.updateChannel">
        <h3 className="text-sm font-medium text-hs-text-secondary mb-3 uppercase tracking-wider">
          {t('settings.systemPage.channel.heading')}
        </h3>
        <div role="radiogroup" aria-label={t('settings.systemPage.channel.heading')} className="space-y-2">
          {offeredChannels.map((option: UpdateChannel) => {
            const selected = channel === option;
            return (
              <label
                key={option}
                className={`flex items-start gap-3 rounded-md border px-3 py-2.5 cursor-pointer transition-colors ${
                  selected
                    ? 'bg-hs-accent-soft border-hs-accent/40'
                    : 'bg-hs-input border-hs-border hover:border-hs-border-strong'
                }`}
              >
                <input
                  type="radio"
                  name="update-channel"
                  value={option}
                  checked={selected}
                  onChange={() => handleSetChannel(option)}
                  className="accent-hs-accent mt-0.5"
                />
                <span className="min-w-0">
                  <span className="block text-sm text-hs-text-primary">
                    {t(`settings.systemPage.channel.${option}.label`)}
                  </span>
                  <span className="block text-xs text-hs-text-faint mt-0.5">
                    {t(`settings.systemPage.channel.${option}.help`)}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
        {channel === 'nightly' && (
          <p className="mt-2 text-xs text-hs-warning" role="note">
            {t('settings.systemPage.channel.nightlyWarning')}
            {autoUpdate.enabled && <> {t('settings.systemPage.channel.nightlyAutoUpdateNote')}</>}
          </p>
        )}
      </section>

      {/* Installing by itself is for people who have opted into the developer
          controls. Hiding the section does not switch it off; the Advanced
          help line says so while it is on. */}
      {advancedMode && (
        <AutoUpdateSection
          info={versionInfo.autoUpdate}
          currentVersion={versionInfo.current}
          enabled={autoUpdate.enabled}
          time={autoUpdate.time}
          saveError={autoUpdateSaveError}
          onToggle={handleToggleAutoUpdate}
          onSetTime={handleSetAutoUpdateTime}
        />
      )}

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
                      {formatDateInTZ(new Date(r.published), timezone, { dateStyle: 'short' }, locale)}
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
              // Rows the pipeline would refuse (see update-policy.ts) say why
              // instead of offering a button that fails on the first step.
              const above = compareSemver(tagInfo.version, versionInfo.current) > 0;
              const unmetFloor = above ? lowestUnmetFloor(tagInfo, versionInfo.current) : null;
              const cannotRead = !above && isDowngradeBlocked(tagInfo, localSchema);
              const blockedText = unmetFloor
                ? t('settings.systemPage.history.needsFirst', { version: unmetFloor })
                : cannotRead
                  ? t('settings.systemPage.history.cannotRead')
                  : null;
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
                  {!isCurrent && blockedText && (
                    <span className="text-xs text-hs-text-faint" data-testid="system-history-blocked">
                      {blockedText}
                    </span>
                  )}
                  {!isCurrent && !blockedText && (
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
              {autoUpdate.enabled && <> {t('settings.systemPage.advanced.autoUpdateNote')}</>}
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
