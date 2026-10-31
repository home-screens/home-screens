'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { ChefHat, CircleCheck, RotateCw, TriangleAlert } from 'lucide-react';
import Button from '@/components/ui/Button';
import SecretField, { type SecretStatus } from './shared/SecretField';
import IntegrationCard from './shared/IntegrationCard';
import { getStatusInfo } from './shared/integration-status';
import { checkMealie, type MealieCheck } from '@/components/editor/useMealieCheck';
import { settingsPath } from '@/lib/settings-route';
import { editorFetch } from '@/lib/editor-fetch';
import { useTranslate } from '@/i18n';

/**
 * The card's `data-field-id`, which the Meals page links to. Written out
 * literally on the card too, where the settings search test looks for it.
 */
export const MEALIE_CARD_FIELD_ID = 'integrations.mealie';

interface Props {
  status: SecretStatus;
  /** Re-read which keys are saved after one changes. */
  onSaved: () => void;
  /** Open on arrival, for a link from the Meals page. */
  defaultOpen?: boolean;
}

/**
 * Settings > API keys: Mealie's address and API token, built like the Immich
 * card, plus a Test button that asks Mealie who the token belongs to and
 * answers in a plain sentence for each way it can go.
 */
export default function MealieIntegrationCard({ status, onSaved, defaultOpen }: Props) {
  const t = useTranslate('editor');
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<MealieCheck | null>(null);

  const runTest = useCallback(async () => {
    setTesting(true);
    setResult(await checkMealie());
    setTesting(false);
  }, []);

  // A changed address or token makes the last answer about something else.
  const saved = useCallback(() => {
    setResult(null);
    onSaved();
  }, [onSaved]);

  // While the meal plan lives in Mealie, removing the address or the token
  // takes the plan off the wall and the phone: ask first.
  const removeQuestion = useCallback(async () => {
    const res = await editorFetch('/api/meals/data');
    const data = res.ok ? ((await res.json()) as { settings?: { planSource?: string } }) : null;
    if (data?.settings?.planSource !== 'mealie') return null;
    return {
      title: t('settings.integrationsPage.mealie.removeConfirm.title'),
      message: t('settings.integrationsPage.mealie.removeConfirm.message'),
      confirmLabel: t('settings.integrationsPage.mealie.removeConfirm.confirmLabel'),
    };
  }, [t]);

  const keys = getStatusInfo(status, ['mealie_url', 'mealie_api_key'], t);
  // Once tested, the pill says what the test found rather than only which
  // fields are filled in: two saved fields that Mealie refuses are not connected.
  const pill = result
    ? result.ok
      ? { label: t('settings.integrationsPage.status.connected'), type: 'connected' as const }
      : { label: t('settings.integrationsPage.mealie.notConnected'), type: 'partial' as const }
    : keys;

  return (
    <IntegrationCard
      fieldId="integrations.mealie"
      icon={<ChefHat className="w-[18px] h-[18px] text-white" />}
      iconBg="#e58325"
      name={t('settings.integrationsPage.mealie.name')}
      description={t('settings.integrationsPage.mealie.description')}
      statusLabel={pill.label}
      statusType={pill.type}
      defaultOpen={defaultOpen}
    >
      <div className="space-y-4">
        <SecretField
          label={t('settings.integrationsPage.mealie.urlLabel')}
          secretKey="mealie_url"
          placeholder={t('settings.integrationsPage.mealie.urlPlaceholder')}
          helpText={t('settings.integrationsPage.mealie.urlHelp')}
          status={!!status.mealie_url}
          onSaved={saved}
          plainText
          removeQuestion={removeQuestion}
        />
        <SecretField
          label={t('settings.integrationsPage.mealie.tokenLabel')}
          secretKey="mealie_api_key"
          placeholder={t('settings.integrationsPage.mealie.tokenPlaceholder')}
          helpText={t('settings.integrationsPage.mealie.tokenHelp')}
          status={!!status.mealie_api_key}
          onSaved={saved}
          removeQuestion={removeQuestion}
        />
        <div className="pt-3.5 border-t border-hs-border-strong/60 space-y-2.5">
          <div className="flex items-center gap-2.5">
            <Button variant="secondary" onClick={runTest} disabled={testing} className="inline-flex items-center gap-1.5">
              <RotateCw className={`w-3.5 h-3.5 ${testing ? 'animate-spin' : ''}`} aria-hidden />
              {testing ? t('settings.integrationsPage.mealie.testing') : t('settings.integrationsPage.mealie.testButton')}
            </Button>
            <span className="text-xs text-hs-text-faint">{t('settings.integrationsPage.mealie.testHelp')}</span>
          </div>
          {result && !testing && <MealieTestResult result={result} />}
        </div>
      </div>
    </IntegrationCard>
  );
}

function MealieTestResult({ result }: { result: MealieCheck }) {
  const t = useTranslate('editor');
  if (result.ok) {
    return (
      <div role="status" data-testid="mealie-test-result" className="flex items-start gap-2 rounded-md border border-hs-success/30 bg-hs-success/8 px-2.5 py-2 text-xs leading-[17px] text-hs-success">
        <CircleCheck className="w-3.5 h-3.5 mt-px shrink-0" aria-hidden />
        <div className="min-w-0">
          <p className="font-semibold">
            {t('settings.integrationsPage.mealie.result.connected', { household: result.household, version: result.version })}
          </p>
          {/* The saved address is never shown in its box, so the answer names it. */}
          <p className="text-hs-text-muted break-all">{result.url}</p>
          <p className="text-hs-text-muted">{t('settings.integrationsPage.mealie.result.checkedNow')}</p>
          <Link
            href={settingsPath({ kind: 'defaults', page: 'meals' }, { highlight: 'meals.planSource' })}
            className="inline-block mt-1 font-medium text-hs-accent hover:text-hs-accent-hover"
          >
            {t('settings.integrationsPage.mealie.result.mealsLink')} &rarr;
          </Link>
        </div>
      </div>
    );
  }
  const base = `settings.integrationsPage.mealie.result.${result.failure}`;
  return (
    <div role="status" data-testid="mealie-test-result" className="flex items-start gap-2 rounded-md border border-hs-warning/30 bg-hs-warning/10 px-2.5 py-2 text-xs leading-[17px] text-hs-warning">
      <TriangleAlert className="w-3.5 h-3.5 mt-px shrink-0" aria-hidden />
      <div className="min-w-0">
        <p className="font-semibold">{t(`${base}.title`, { version: result.version ?? '' })}</p>
        <p className="text-hs-text-muted">{t(`${base}.body`)}</p>
      </div>
    </div>
  );
}
