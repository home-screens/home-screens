'use client';

import Link from 'next/link';
import { TriangleAlert } from 'lucide-react';
import Notice from '@/components/ui/Notice';
import { useTranslate } from '@/i18n';
import { settingsPath, settingsPlaceText } from '@/lib/settings-route';
import type { ServiceAttention } from '@/lib/service-attention';

/**
 * What is wrong with a set-up service and where to fix it, in the words the
 * wall uses: Google Calendar needing a new sign-in, or a server Home Screens
 * cannot reach. Shown on the API keys card for the service and under the
 * Status page's list of services. `linkToKeys` is for a page other than API
 * keys, which then points there.
 */
export default function ServiceAttentionNotice({ attention, name, linkToKeys = false, className }: {
  attention: ServiceAttention;
  /** The service's own name ("Immich"), for a server that isn't answering. */
  name: string;
  linkToKeys?: boolean;
  className?: string;
}) {
  const t = useTranslate('editor');
  const tCore = useTranslate('core');

  if (attention === 'signIn') {
    return (
      <Notice tone="warning" icon={TriangleAlert} role="status" className={className} testId="service-attention-signin" title={t('settings.calendarPage.health.errors.googleNotSignedIn')}>
        {t('settings.serviceAttention.googleSignInBody')}{' '}
        <Link href={settingsPath({ kind: 'defaults', page: 'calendar' })} className="text-hs-accent hover:underline">
          {t('settings.serviceAttention.googleSignInLink', { place: settingsPlaceText(tCore, 'calendar') })}
        </Link>
      </Notice>
    );
  }

  const keysPlace = settingsPlaceText(tCore, 'integrations');
  return (
    <Notice tone="warning" icon={TriangleAlert} role="status" className={className} testId="service-attention-unreachable" title={t('settings.serviceAttention.unreachableTitle', { name })}>
      {t('settings.serviceAttention.unreachableBody', { place: keysPlace })}
      {linkToKeys && (
        <>
          {' '}
          <Link href={settingsPath({ kind: 'defaults', page: 'integrations' })} className="text-hs-accent hover:underline">
            {t('settings.serviceAttention.openPlace', { place: keysPlace })}
          </Link>
        </>
      )}
    </Notice>
  );
}
