'use client';

import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import Button from '@/components/ui/Button';
import ChangelogModal from './ChangelogModal';
import AutoUpdateSection from './AutoUpdateSection';
import Toggle, { Switch } from '@/components/ui/Toggle';
import FieldHint from '@/components/ui/FieldHint';
import { useFormattingLocale, useTranslate } from '@/i18n';
import { formatDateInTZ } from '@/lib/timezone';
import { useEditorHouseholdTimezone } from '@/components/editor/useEditorHouseholdClock';
import { UPDATE_CHANNELS, classifyVersion, compareSemver, type UpdateChannel } from '@/lib/semver';
import { isDowngradeBlocked, lowestUnmetFloor } from '@/lib/update-policy';
import SudoPasswordPrompt from '@/components/editor/SudoPasswordPrompt';
import { useSystemActions, type PowerSource, type PowerState } from './useSystemActions';
import { SettingsSectionHeading } from '@/components/editor/settings/shared/SettingsPanel';
import { CHECKBOX_CLASS } from '@/components/ui/input-classes';
import Notice from '@/components/ui/Notice';
import StatusDot from '@/components/ui/StatusDot';
import StatusPill from '@/components/ui/StatusPill';

interface Props {
  onUpgrade: (tag: string, currentVersion: string | null) => void;
  onRollback: (tag: string, currentVersion: string | null) => void;
}

/** How many past versions the rollback list offers before "show all". */
const VISIBLE_ROLLBACK_TAGS = 3;

export default function SystemSection({ onUpgrade, onRollback }: Props) {
  const t = useTranslate('editor');
  const tCore = useTranslate('core');
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
    handlePowerPasswordGranted,
    handlePowerPasswordCancel,
    handleCancelUpgrade,
  } = useSystemActions({ onUpgrade, onRollback });

  // A failed request can be tried again; one in flight, sent, or waiting on
  // the device password cannot be sent twice.
  const powerBusy = powerState.status === 'pending'
    || powerState.status === 'ok'
    || powerState.status === 'needs-password';
  const powerStatusFor = (source: PowerSource) => (
    <PowerStatusLine
      state={powerState}
      source={source}
      onPasswordGranted={handlePowerPasswordGranted}
      onPasswordCancel={handlePowerPasswordCancel}
    />
  );

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
        <SettingsSectionHeading>
          {t('settings.systemPage.version.heading')}
        </SettingsSectionHeading>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-hs-text-primary text-sm flex items-center gap-2 flex-wrap">
              <span>{t('settings.systemPage.version.currentLabel', { version: versionInfo.current })}</span>
              {/* A prerelease build says so next to its number, so a bug
                  report screenshot from a test build is readable at a glance. */}
              {versionInfo.currentChannel !== 'stable' && (
                <StatusPill tone="warning" size="sm" data-testid="system-build-badge">
                  {t(`settings.systemPage.version.${versionInfo.currentChannel}BuildBadge`)}
                </StatusPill>
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
          <Notice
            tone="warning"
            className="mt-3"
            title={t('settings.systemPage.upgradeInProgress.title')}
            action={
              <Button variant="danger" size="sm" onClick={handleCancelUpgrade}>
                {t('settings.systemPage.upgradeInProgress.cancelButton')}
              </Button>
            }
          >
            {t('settings.systemPage.upgradeInProgress.help')}
          </Notice>
        )}

        {versionInfo.updateAvailable && versionInfo.latest && (
          <Notice
            tone={bannerIsWarning ? 'warning' : 'info'}
            testId="system-update-banner"
            className="mt-3"
            title={bannerTitle}
            action={
              <Button
                variant={bannerIsWarning ? 'warning' : 'primary'}
                size="sm"
                onClick={() => handleUpgrade(`v${versionInfo.latest}`)}
                // The hub turns a second update down while one runs.
                disabled={versionInfo.upgradeRunning}
              >
                {bannerButton}
              </Button>
            }
          >
            {bannerLine}
          </Notice>
        )}

        {withheld && (
          <Notice tone="warning" testId="system-update-withheld" className="mt-3" title={withheld.title}>
            {withheld.line}
          </Notice>
        )}

        {/* No resolved release means the lookup never got an answer (GitHub
            unreachable, no tags), which is not the same as being current. */}
        {!versionInfo.updateAvailable && !withheld && versionInfo.latest !== null && (
          <p className="text-xs text-hs-success/80 mt-2 flex items-center gap-1.5">
            <StatusDot tone="success" size="sm" />
            {t('settings.systemPage.upToDate')}
          </p>
        )}

        {!versionInfo.updateAvailable && !withheld && versionInfo.latest === null && (
          <p data-testid="system-check-failed" className="text-xs text-hs-text-secondary mt-2">
            {t('settings.systemPage.checkFailed')}
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

        {/* The update is installed but the wall runs the old launcher until
            the device restarts. No dismiss: it stays true until then, and a
            restart clears it by itself. */}
        {versionInfo.restartNeeded && (
          <div
            data-testid="system-restart-needed"
            className="mt-3 rounded-lg border p-3 bg-hs-accent-soft border-hs-accent/30"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-hs-accent-hover">
                  {t('settings.systemPage.restartNeeded.title')}
                </p>
                <p className="text-xs mt-0.5 text-hs-accent-hover/70">
                  {t('settings.systemPage.restartNeeded.line')}
                </p>
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={() => handlePowerAction('reboot', 'restart-notice')}
                disabled={powerBusy}
              >
                {t('settings.systemPage.restartNeeded.button')}
              </Button>
            </div>
            {powerStatusFor('restart-notice')}
          </div>
        )}
      </section>

      {/* Which builds the update check offers. Normal, Early access and Beta
          are for everyone: candidates and betas exist to get ordinary homes
          onto them early. Test builds are a developer control and hide
          behind advanced mode, except that a device already on them keeps
          the option visible so it can always be switched off. */}
      <section data-field-id="system.updateChannel">
        <SettingsSectionHeading>
          {t('settings.systemPage.channel.heading')}
        </SettingsSectionHeading>
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
                  className={`${CHECKBOX_CLASS} mt-0.5`}
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
          <p className="mt-2 text-xs text-hs-warning-ink" role="note">
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

      {/* Update notification */}
      <section data-field-id="system.updateNotification">
        <SettingsSectionHeading>
          {t('settings.systemPage.updateNotification.heading')}
        </SettingsSectionHeading>
        <FieldHint className="mb-3">
          {t('settings.systemPage.updateNotification.description')}
        </FieldHint>
        <Toggle
          label={t('settings.systemPage.updateNotification.enableLabel')}
          checked={updateNotificationEnabled}
          onChange={handleToggleUpdateNotification}
        />
        {updateNotifSaveError && (
          <p className="text-xs text-hs-danger mt-2" role="alert">
            {tCore('refusals.saveFailed')}
          </p>
        )}
      </section>

      {/* Changelog */}
      <section data-field-id="system.changelog">
        <SettingsSectionHeading
          trailing={!showChangelog && (
            <button
              onClick={handleOpenChangelog}
              className="text-xs text-hs-accent hover:text-hs-accent-hover"
            >
              {t('settings.systemPage.changelog.viewButton')}
            </button>
          )}
        >
          {t('settings.systemPage.changelog.heading')}
        </SettingsSectionHeading>

        {showChangelog && (
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {releases.length === 0 ? (
              <FieldHint>
                {t('settings.systemPage.changelog.empty')}
              </FieldHint>
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
          <SettingsSectionHeading>
            {t('settings.systemPage.history.heading')}
          </SettingsSectionHeading>
          <FieldHint className="mb-3">
            {t('settings.systemPage.history.help')}
          </FieldHint>
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
                      <StatusPill tone="info" size="sm">
                        {t('settings.systemPage.history.currentBadge')}
                      </StatusPill>
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
                      disabled={versionInfo.upgradeRunning}
                      className="text-xs text-hs-text-muted hover:text-hs-warning-ink transition-colors disabled:opacity-50 disabled:pointer-events-none"
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
            <FieldHint className="mt-2">
              {t('settings.systemPage.history.olderWarning')}
            </FieldHint>
          )}
        </section>
      )}

      {/* System Actions */}
      <section>
        <SettingsSectionHeading>
          {t('settings.systemPage.actions.heading')}
        </SettingsSectionHeading>
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handlePowerAction('restart-service')}
            disabled={powerBusy}
            data-field-id="system.restartService"
          >
            {t('settings.systemPage.actions.restartService')}
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => handlePowerAction('reboot')}
            disabled={powerBusy}
            data-field-id="system.rebootSystem"
          >
            {t('settings.systemPage.actions.rebootSystem')}
          </Button>
        </div>
        {powerStatusFor('actions')}
        <FieldHint className="mt-2">
          {t('settings.systemPage.actions.help')}
        </FieldHint>
      </section>

      {/* Advanced mode */}
      <section>
        <SettingsSectionHeading>
          {t('settings.systemPage.advanced.heading')}
        </SettingsSectionHeading>
        <div className="flex items-start justify-between gap-4" data-field-id="system.advancedMode">
          <div>
            <p className="text-sm text-hs-text-primary">{t('settings.systemPage.advanced.toggleLabel')}</p>
            <FieldHint id="system-advanced-help" className="mt-0.5">
              {t('settings.systemPage.advanced.help')}
              {autoUpdate.enabled && <> {t('settings.systemPage.advanced.autoUpdateNote')}</>}
            </FieldHint>
          </div>
          <Switch
            checked={advancedMode}
            onChange={() => void handleToggleAdvanced()}
            ariaLabel={t('settings.systemPage.advanced.toggleLabel')}
            describedBy="system-advanced-help"
          />
        </div>
      </section>

      {/* Current Version */}

      {openRelease && (
        <ChangelogModal release={openRelease} onClose={() => handleOpenRelease(null)} />
      )}
    </div>
  );
}

/**
 * How a restart request went, shown under the control that asked for it: the
 * "If something seems stuck" buttons or the restart-to-finish notice.
 */
function PowerStatusLine({
  state,
  source,
  onPasswordGranted,
  onPasswordCancel,
}: {
  state: PowerState;
  source: PowerSource;
  onPasswordGranted: () => void;
  onPasswordCancel: () => void;
}) {
  const t = useTranslate('editor');
  if (state.status === 'idle' || state.source !== source) return null;
  switch (state.status) {
    case 'pending':
      return (
        <FieldHint className="mt-2">
          {t('settings.systemPage.powerStatus.processing')}
        </FieldHint>
      );
    case 'ok':
      return (
        <p className="text-xs text-hs-success mt-2" role="status">
          {state.action === 'reboot'
            ? t('settings.systemPage.powerStatus.rebootScheduled')
            : t('settings.systemPage.powerStatus.restartScheduled')}
        </p>
      );
    case 'needs-password':
      return <SudoPasswordPrompt compact onGranted={onPasswordGranted} onCancel={onPasswordCancel} />;
    case 'error':
      return (
        <p className="text-xs text-hs-danger mt-2" role="alert">
          {state.message}
        </p>
      );
  }
}
