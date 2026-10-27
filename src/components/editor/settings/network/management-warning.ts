import type { TranslateFn } from '@/i18n';
import type { ManagementConfirmation } from '@/lib/network-types';

/**
 * The sentence the editor shows before a network change that would cut the
 * adapter the browser is using. The server answers with a kind and, when the
 * device has one, an address on another adapter; the text is composed here so
 * it reads in the household's language and names where to go next.
 */
export function managementWarningText(
  t: TranslateFn,
  data: Pick<ManagementConfirmation, 'warningKind' | 'otherAddress' | 'warning'>,
  /** The browser's own `window.location.port`, so the hint keeps the port in use. */
  port: string,
): string {
  const kind = data.warningKind;
  const lead = kind
    ? t(`settings.networkPage.managementWarning.kinds.${kind}`)
    : data.warning;
  // A connect is undone by the rollback and "we can't tell" has no address to offer
  if (kind === 'connect' || kind === 'unknown') return lead;
  const hint = data.otherAddress
    ? t('settings.networkPage.managementWarning.reachAt', {
        url: `http://${data.otherAddress}${port ? `:${port}` : ''}`,
      })
    : t('settings.networkPage.managementWarning.noOtherAddress');
  return `${lead} ${hint}`;
}
