'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChefHat, CircleCheck, RotateCw, TriangleAlert } from 'lucide-react';
import Button from '@/components/ui/Button';
import SecretField, { type SecretStatus } from './shared/SecretField';
import IntegrationCard from './shared/IntegrationCard';
import { getStatusInfo } from './shared/integration-status';
import { checkMealie, type MealieCheck } from '@/hooks/useMealieCheck';
import { settingsPath } from '@/lib/settings-route';
import { editorFetch } from '@/lib/editor-fetch';
import { useTranslate, type TranslateFn } from '@/i18n';

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

/** What asked for a check: the card being shown, a save or a removal, or the Test button. */
type CheckAsked = 'opening' | 'save' | 'test';

/**
 * Settings > API keys: Mealie's address and API token, built like the Immich
 * card, plus a Test button that asks Mealie who the token belongs to and
 * answers in a plain sentence for each way it can go.
 *
 * The card asks the same once when it is shown with an address saved, and
 * again after each save or removal (never on a timer): its pill then says
 * what Mealie answered, not only which boxes are filled in (two saved boxes
 * whose token Mealie refuses are not "Connected"), and the address box shows
 * the saved address.
 */
export default function MealieIntegrationCard({ status, onSaved, defaultOpen }: Props) {
  const t = useTranslate('editor');
  const [result, setResult] = useState<{ check: MealieCheck; asked: CheckAsked } | null>(null);
  const [asking, setAsking] = useState<CheckAsked | null>(null);
  // The saved address as the last check named it. Kept through a save, so
  // the box does not empty while the next check is on its way.
  const [savedUrl, setSavedUrl] = useState<string | undefined>(undefined);
  // Only the newest check's answer counts: a slow one from before a save
  // must not land over the answer about what is saved now.
  const latest = useRef(0);

  const runCheck = useCallback(async (asked: CheckAsked) => {
    const n = ++latest.current;
    setAsking(asked);
    const check = await checkMealie();
    if (n !== latest.current) return;
    setResult({ check, asked });
    // A failed call to the hub says nothing about the address.
    if (check.ok || check.failure !== 'network') setSavedUrl(check.url);
    setAsking(null);
  }, []);

  // Once as the card is shown, when there is an address to check (and once
  // only, even where React runs the effect twice).
  const checkOnOpening = useRef(!!status.mealie_url);
  useEffect(() => {
    if (!checkOnOpening.current) return;
    checkOnOpening.current = false;
    void runCheck('opening');
  }, [runCheck]);

  // A changed address or token makes the last answer about something else.
  const saved = useCallback(() => {
    setResult(null);
    onSaved();
    void runCheck('save');
  }, [onSaved, runCheck]);

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
  // Nothing saved: Mealie is optional, and most families have nothing to do
  // here. One box saved: the count says what is missing. Both saved: what
  // Mealie answered.
  const pill = keys.type === 'none'
    ? { label: t('settings.integrationsPage.mealie.optional'), type: 'none' as const }
    : keys.type === 'partial'
      ? keys
      : result
        ? checkPill(result.check, t)
        : { label: t('settings.integrationsPage.mealie.checking'), type: 'none' as const };
  const testing = asking === 'test';
  // A check from the card opening shows its answer only once both boxes are
  // saved; with one missing, the count in the pill already says so.
  const shownResult = result && !asking && (keys.type === 'connected' || result.asked === 'test') ? result : null;

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
          savedValue={status.mealie_url ? savedUrl : undefined}
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
            <Button variant="secondary" onClick={() => void runCheck('test')} disabled={testing} className="inline-flex items-center gap-1.5">
              <RotateCw className={`w-3.5 h-3.5 ${testing ? 'animate-spin' : ''}`} aria-hidden />
              {testing ? t('settings.integrationsPage.mealie.testing') : t('settings.integrationsPage.mealie.testButton')}
            </Button>
            <span className="text-xs text-hs-text-faint">{t('settings.integrationsPage.mealie.testHelp')}</span>
          </div>
          {shownResult && <MealieTestResult result={shownResult.check} offerMeals={shownResult.asked !== 'opening'} />}
        </div>
      </div>
    </IntegrationCard>
  );
}

/** The pill for what a check found, once both boxes are saved. */
function checkPill(check: MealieCheck, t: TranslateFn): { label: string; type: 'connected' | 'partial' } {
  if (check.ok) return { label: t('settings.integrationsPage.status.connected'), type: 'connected' };
  const label = check.failure === 'key-rejected'
    ? t('settings.integrationsPage.mealie.tokenRefused')
    : check.failure === 'unreachable'
      ? t('settings.integrationsPage.mealie.notAnswering')
      : check.failure === 'network'
        ? t('settings.integrationsPage.mealie.couldNotCheck')
        : t('settings.integrationsPage.mealie.notConnected');
  return { label, type: 'partial' };
}

/**
 * What a check found, in a plain sentence. `offerMeals`: link on to the Meals
 * page after a save or a Test (the next step in setting Mealie up), not every
 * time the card is shown to a family already using it.
 */
function MealieTestResult({ result, offerMeals }: { result: MealieCheck; offerMeals: boolean }) {
  const t = useTranslate('editor');
  if (result.ok) {
    return (
      <div role="status" data-testid="mealie-test-result" className="flex items-start gap-2 rounded-md border border-hs-success/30 bg-hs-success/8 px-2.5 py-2 text-xs leading-[17px] text-hs-success">
        <CircleCheck className="w-3.5 h-3.5 mt-px shrink-0" aria-hidden />
        <div className="min-w-0">
          <p className="font-semibold">
            {t('settings.integrationsPage.mealie.result.connected', { household: result.household, version: result.version })}
          </p>
          <p className="text-hs-text-muted">{t('settings.integrationsPage.mealie.result.checkedNow')}</p>
          {offerMeals && (
            <Link
              href={settingsPath({ kind: 'defaults', page: 'meals' }, { highlight: 'meals.planSource' })}
              className="inline-block mt-1 font-medium text-hs-accent hover:text-hs-accent-hover"
            >
              {t('settings.integrationsPage.mealie.result.mealsLink')} &rarr;
            </Link>
          )}
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
