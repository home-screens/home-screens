/**
 * Which confirmation to show before installing a different version.
 *
 * Installing an older release is not an upgrade, and the difference is not
 * cosmetic: settings saved by the newer build may not work once the older one
 * is running, and that sentence only exists in the going-back copy. The
 * update banner and the version-history rows both end up here so the two can
 * never disagree about which dialog a step backwards gets.
 *
 * Pure: returns translation keys, not text, so the caller stays the only
 * place that touches the dictionary.
 */
export type VersionChangeDirection = 'upgrade' | 'downgrade';

export interface VersionChangeDialogKeys {
  titleKey: string;
  messageKey: string;
  confirmKey: string;
  /** Confirm-button style. A step backwards is not the primary action: it can leave newer settings unreadable. */
  variant: 'primary' | 'danger';
}

/** `isDowngrade` comes from `/api/system/version`: the offer is older than what runs. */
export function versionChangeDirection(isDowngrade: boolean | undefined): VersionChangeDirection {
  return isDowngrade ? 'downgrade' : 'upgrade';
}

export function versionChangeDialogKeys(direction: VersionChangeDirection): VersionChangeDialogKeys {
  if (direction === 'downgrade') {
    return {
      titleKey: 'settings.systemPage.rollbackDialog.title',
      messageKey: 'settings.systemPage.rollbackDialog.message',
      confirmKey: 'settings.systemPage.rollbackDialog.confirm',
      variant: 'danger',
    };
  }
  return {
    titleKey: 'settings.systemPage.upgradeDialog.title',
    messageKey: 'settings.systemPage.upgradeDialog.message',
    confirmKey: 'settings.systemPage.upgradeDialog.confirm',
    variant: 'primary',
  };
}
