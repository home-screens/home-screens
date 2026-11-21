import type { TranslateFn } from '@/i18n';
import type { SecretKey } from '@/lib/secrets';
import type { SecretStatus } from './SecretField';

/** A card's status pill from how many of its keys are saved: none, some, or all. */
export function getStatusInfo(
  status: SecretStatus,
  keys: SecretKey[],
  t: TranslateFn,
): { label: string; type: 'connected' | 'partial' | 'none' } {
  const configured = keys.filter((k) => !!status[k]).length;
  if (configured === 0) {
    return { label: t('settings.integrationsPage.status.notConfigured'), type: 'none' };
  }
  if (configured === keys.length) {
    return { label: t('settings.integrationsPage.status.connected'), type: 'connected' };
  }
  return {
    label: t('settings.integrationsPage.status.partial', {
      configured,
      total: keys.length,
    }),
    type: 'partial',
  };
}
