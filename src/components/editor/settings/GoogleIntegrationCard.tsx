'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import SecretField, { type SecretCheck, type SecretStatus } from './shared/SecretField';
import IntegrationCard from './shared/IntegrationCard';
import { getStatusInfo } from './shared/integration-status';
import { useTranslate, type TranslateFn } from '@/i18n';
import { hostedSignInOn, type GoogleAppsStatus } from '@/lib/google-apps';
import { settingsPath } from '@/lib/settings-route';

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

const GOOGLE_CALENDAR_DOCS = 'https://homescreens.dev/docs/calendars#google-sign-in';
const GOOGLE_PHOTOS_DOCS = 'https://homescreens.dev/docs/backgrounds';
const GOOGLE_PHOTOS_HOW_IT_WORKS = 'https://homescreens.dev/docs/backgrounds#google-photos';
const GOOGLE_MAPS_DOCS = 'https://homescreens.dev/docs/calendars#api-keys';

/**
 * Heading for one group of credentials inside the Google card: what the
 * credentials are for, one sentence on how to make them, and the walkthrough.
 * Google requires you to create an OAuth client in the Cloud Console before
 * any of this works, and the card previously buried that in the tail of a
 * five-line field help string.
 */
function GoogleBand({
  title,
  help,
  docsHref,
  t,
}: {
  title: string;
  help: string;
  docsHref: string;
  t: TranslateFn;
}) {
  return (
    <div className="mb-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] font-semibold text-hs-text-body">{title}</span>
        <a
          href={docsHref}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-xs text-hs-accent hover:underline"
        >
          {t('settings.integrationsPage.google.stepByStep')}
        </a>
      </div>
      <p className="mt-0.5 max-w-[640px] text-xs text-hs-text-faint">{help}</p>
    </div>
  );
}

/**
 * Google Client IDs always end in `.apps.googleusercontent.com`. Typing
 * anything else used to save and report "Saved successfully", so the failure
 * surfaced later as a calendar that never connected, with nothing pointing
 * back at the field. `allowAnyway` is deliberately false: a value of this
 * shape cannot work, so there is no judgement call to hand back to the user.
 */
const GOOGLE_CLIENT_ID_SUFFIX = '.apps.googleusercontent.com';

interface Props {
  status: SecretStatus;
  /** Re-reads saved keys; with Home Screens' app on, also which app signs in. */
  onSaved: () => void;
  /** What the hub reports; null (loading or failed) shows the card as it always was. */
  apps: GoogleAppsStatus | null;
}

/**
 * The Google card on the API keys page.
 *
 * With Home Screens' own Google app off (the default, and whenever the hub's
 * answer is missing) this is exactly the card it always was: five boxes in
 * three labelled bands. With it on, Calendar and Photos need nothing here, so
 * the card leads with "ready to use", keeps the Maps key in the open (it has
 * nothing to do with signing in), and folds the four sign-in boxes under
 * "Use your own Google app". A household that saved its own app finds that
 * section open, and its sign-ins carry on exactly as before.
 */
export default function GoogleIntegrationCard({ status, onSaved, apps }: Props) {
  const t = useTranslate('editor');

  const validateGoogleClientId = useCallback(
    async (value: string): Promise<SecretCheck> =>
      value.trim().endsWith(GOOGLE_CLIENT_ID_SUFFIX)
        ? { ok: true }
        : {
            ok: false,
            message: t('settings.integrationsPage.google.clientIdInvalid', {
              suffix: GOOGLE_CLIENT_ID_SUFFIX,
            }),
            allowAnyway: false,
          },
    [t],
  );

  const calendarFields = (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <SecretField
        label={t('settings.integrationsPage.google.clientIdLabel')}
        secretKey="google_client_id"
        placeholder={t('settings.integrationsPage.google.clientIdPlaceholder')}
        helpText={t('settings.integrationsPage.google.clientIdHelp')}
        status={!!status.google_client_id}
        onSaved={onSaved}
        validate={validateGoogleClientId}
      />
      <SecretField
        label={t('settings.integrationsPage.google.clientSecretLabel')}
        secretKey="google_client_secret"
        placeholder={t('settings.integrationsPage.google.clientSecretPlaceholder')}
        helpText={t('settings.integrationsPage.google.clientSecretHelp')}
        status={!!status.google_client_secret}
        onSaved={onSaved}
      />
    </div>
  );

  const photosFields = (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <SecretField
        label={t('settings.integrationsPage.google.webClientIdLabel')}
        secretKey="google_web_client_id"
        placeholder={t('settings.integrationsPage.google.clientIdPlaceholder')}
        helpText={t('settings.integrationsPage.google.webClientIdHelp')}
        status={!!status.google_web_client_id}
        onSaved={onSaved}
        validate={validateGoogleClientId}
      />
      <SecretField
        label={t('settings.integrationsPage.google.webClientSecretLabel')}
        secretKey="google_web_client_secret"
        placeholder={t('settings.integrationsPage.google.clientSecretPlaceholder')}
        helpText={t('settings.integrationsPage.google.webClientSecretHelp')}
        status={!!status.google_web_client_secret}
        onSaved={onSaved}
      />
    </div>
  );

  // "The same Cloud Console project" only makes sense below the sign-in
  // boxes, so the Maps key drops that line when it stands on its own.
  const mapsField = (sameProjectHelp: boolean) => (
    <div className="lg:max-w-[calc(50%-0.5rem)]">
      <SecretField
        label={t('settings.integrationsPage.google.mapsKeyLabel')}
        secretKey="google_maps_key"
        placeholder={t('settings.integrationsPage.google.mapsKeyPlaceholder')}
        helpText={sameProjectHelp ? t('settings.integrationsPage.google.mapsKeyHelp') : undefined}
        status={!!status.google_maps_key}
        onSaved={onSaved}
      />
    </div>
  );

  if (!hostedSignInOn(apps)) {
    // The Photos-import web client is optional: it must not demote a fully
    // configured Calendar+Maps setup from "Connected" to "partial".
    const google = getStatusInfo(status, ['google_client_id', 'google_client_secret', 'google_maps_key'], t);
    return (
      <IntegrationCard
        fieldId="integrations.google"
        icon={<GoogleIcon />}
        iconBg="linear-gradient(135deg, #4285f4 0%, #34a853 50%, #fbbc05 75%, #ea4335 100%)"
        name={t('settings.integrationsPage.google.name')}
        description={t('settings.integrationsPage.google.description')}
        statusLabel={google.label}
        statusType={google.type}
        defaultOpen={google.type !== 'none'}
      >
        {/* Three labelled bands rather than three anonymous hairline-
            separated rows. The card holds five credentials for three
            unrelated jobs, and nothing used to say which two the calendar
            needs, or that the middle pair is a different Google login. */}
        <GoogleBand
          title={t('settings.integrationsPage.google.calendarBand.title')}
          help={t('settings.integrationsPage.google.calendarBand.help')}
          docsHref={GOOGLE_CALENDAR_DOCS}
          t={t}
        />
        {calendarFields}
        {/* Google Photos import uses a separate "Web application" OAuth
            client: the picker scope is rejected by the TV/device flow the
            calendar client uses. */}
        <div className="border-t border-hs-border-strong/60 mt-4 pt-4">
          <GoogleBand
            title={t('settings.integrationsPage.google.photosBand.title')}
            help={t('settings.integrationsPage.google.photosBand.help')}
            docsHref={GOOGLE_PHOTOS_DOCS}
            t={t}
          />
        </div>
        {photosFields}
        <div className="border-t border-hs-border-strong/60 mt-4 pt-4">
          <GoogleBand
            title={t('settings.integrationsPage.google.mapsBand.title')}
            help={t('settings.integrationsPage.google.mapsBand.help')}
            docsHref={GOOGLE_MAPS_DOCS}
            t={t}
          />
        </div>
        {mapsField(true)}
      </IntegrationCard>
    );
  }

  return (
    <HostedGoogleCard
      status={status}
      apps={apps!}
      t={t}
      calendarFields={calendarFields}
      photosFields={photosFields}
      mapsField={mapsField(false)}
    />
  );
}

function HostedGoogleCard({
  status,
  apps,
  t,
  calendarFields,
  photosFields,
  mapsField,
}: {
  status: SecretStatus;
  apps: GoogleAppsStatus;
  t: TranslateFn;
  calendarFields: React.ReactNode;
  photosFields: React.ReactNode;
  mapsField: React.ReactNode;
}) {
  // Any own key saved, even half a pair, is the household's own app: the
  // hub resolves it that way (google-token-store.ts), so the card must too.
  const ownSaved = !!(
    status.google_client_id || status.google_client_secret
    || status.google_web_client_id || status.google_web_client_secret
  );
  const calendarReady = apps.calendar.mode === 'hosted';
  const photosReady = apps.photos.mode === 'hosted';
  const [ownOpen, setOwnOpen] = useState(ownSaved);

  const readyTitle = calendarReady && photosReady
    ? t('settings.integrationsPage.google.ready.titleBoth')
    : calendarReady
      ? t('settings.integrationsPage.google.ready.titleCalendar')
      : photosReady
        ? t('settings.integrationsPage.google.ready.titlePhotos')
        : null;

  const ownHint = ownSaved
    ? ownOpen ? t('settings.integrationsPage.google.ownApp.hintSaved') : null
    : ownOpen
      ? t('settings.integrationsPage.google.ownApp.hintOpen')
      : t('settings.integrationsPage.google.ownApp.hintClosed');

  return (
    <IntegrationCard
      fieldId="integrations.google"
      icon={<GoogleIcon />}
      iconBg="linear-gradient(135deg, #4285f4 0%, #34a853 50%, #fbbc05 75%, #ea4335 100%)"
      name={t('settings.integrationsPage.google.name')}
      description={t('settings.integrationsPage.google.description')}
      statusLabel={ownSaved ? t('settings.integrationsPage.status.ownApp') : t('settings.integrationsPage.status.ready')}
      statusType={ownSaved ? 'own' : 'connected'}
      defaultOpen
    >
      {readyTitle && (
        <div className="flex gap-3 mb-4 pb-4 border-b border-hs-border-strong/60" data-testid="google-ready">
          <span className="mt-px grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full bg-hs-success/15 text-hs-success">
            <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
          </span>
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-hs-text-body">{readyTitle}</div>
            <p className="mt-0.5 text-xs text-hs-text-muted">
              {calendarReady && photosReady
                ? t('settings.integrationsPage.google.ready.helpBoth')
                : t('settings.integrationsPage.google.ready.helpOne')}
            </p>
            <div className="mt-2 flex flex-wrap gap-x-[18px] gap-y-1 text-xs">
              {calendarReady && (
                <Link
                  href={settingsPath({ kind: 'defaults', page: 'calendar' })}
                  className="text-hs-accent hover:underline"
                >
                  {t('settings.integrationsPage.google.ready.connectCalendar')}
                </Link>
              )}
              {photosReady && (
                <a
                  href={GOOGLE_PHOTOS_HOW_IT_WORKS}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-hs-accent hover:underline"
                >
                  {t('settings.integrationsPage.google.ready.photosHowItWorks')}
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      <GoogleBand
        title={t('settings.integrationsPage.google.mapsBand.title')}
        help={t('settings.integrationsPage.google.mapsBand.helpOwnProject')}
        docsHref={GOOGLE_MAPS_DOCS}
        t={t}
      />
      {mapsField}

      <div className="border-t border-hs-border-strong/60 mt-4 -mb-1.5">
        <button
          type="button"
          onClick={() => setOwnOpen((open) => !open)}
          aria-expanded={ownOpen}
          data-testid="google-own-app-toggle"
          className="flex w-full items-center gap-2 py-3 text-left text-[13px] text-hs-text-secondary hover:text-hs-text-body"
        >
          <ChevronRight
            className={`h-3.5 w-3.5 shrink-0 text-hs-text-faint transition-transform ${ownOpen ? 'rotate-90' : ''}`}
          />
          <span className="whitespace-nowrap">{t('settings.integrationsPage.google.ownApp.title')}</span>
          {ownHint && <span className="ml-1 min-w-0 truncate text-xs text-hs-text-faint">{ownHint}</span>}
        </button>
        {ownOpen && (
          <div className="pb-4" data-testid="google-own-app">
            {(calendarReady || photosReady) && (
              <p className="mb-4 rounded-lg border border-hs-warning/35 bg-hs-warning/10 px-3 py-2.5 text-xs text-hs-warning">
                {t('settings.integrationsPage.google.ownApp.warning')}
              </p>
            )}
            <GoogleBand
              title={t('settings.integrationsPage.google.calendarBand.title')}
              help={t('settings.integrationsPage.google.calendarBand.helpOwnApp')}
              docsHref={GOOGLE_CALENDAR_DOCS}
              t={t}
            />
            {calendarFields}
            <div className="border-t border-hs-border-strong/60 mt-4 pt-4">
              <GoogleBand
                title={t('settings.integrationsPage.google.photosBand.title')}
                help={t('settings.integrationsPage.google.photosBand.helpOwnApp')}
                docsHref={GOOGLE_PHOTOS_DOCS}
                t={t}
              />
            </div>
            {photosFields}
          </div>
        )}
      </div>
    </IntegrationCard>
  );
}
