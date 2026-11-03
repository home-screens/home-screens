'use client';

import AccordionSection from './AccordionSection';
import PropertyGroup from './PropertyGroup';
import PluginSecretsSection from './PluginSecretsSection';
import PluginAuthSection from './PluginAuthSection';
import { useTranslate } from '@/i18n';
import type { PluginAuth, PluginManifest } from '@/types/plugins';

/**
 * The secret keys the OAuth connection itself needs: its client id and, when
 * the provider issues one, its client secret. They render beside the connect
 * button rather than in the general secrets list. Garmin signs in with a
 * typed password and declares none.
 */
export function getAuthSecretKeys(auth: PluginAuth | undefined): string[] {
  if (auth?.type !== 'oauth2') return [];
  return [auth.secrets.clientId, auth.secrets.clientSecret].filter((k): k is string => Boolean(k));
}

/**
 * The Connection and Secrets accordions of a plugin module: the sign-in with
 * the credentials it needs, then whatever other secrets the manifest declares.
 */
export default function PluginSettingsSections({ manifest }: { manifest: PluginManifest }) {
  const t = useTranslate('editor');
  const auth = manifest.auth;
  const authSecretKeys = getAuthSecretKeys(auth);
  const declaredSecrets = manifest.secrets ?? [];
  const otherKeys = declaredSecrets.map((s) => s.key).filter((k) => !authSecretKeys.includes(k));

  return (
    <>
      {auth && (
        <AccordionSection title={t('propertyPanel.sections.connection')} defaultOpen>
          {authSecretKeys.length > 0 && (
            <PropertyGroup title={t('propertyPanel.sections.connectionSetup')} accent={2}>
              <div className="space-y-3">
                <PluginSecretsSection pluginId={manifest.id} secrets={declaredSecrets} keyFilter={authSecretKeys} />
              </div>
            </PropertyGroup>
          )}
          <PropertyGroup title={t('propertyPanel.sections.settings')} accent={1}>
            <PluginAuthSection pluginId={manifest.id} auth={auth} />
          </PropertyGroup>
        </AccordionSection>
      )}

      {otherKeys.length > 0 && (
        <AccordionSection title={t('propertyPanel.sections.secrets')} defaultOpen={false}>
          <PropertyGroup title={t('propertyPanel.sections.credentials')} accent={2}>
            <div className="space-y-3">
              <PluginSecretsSection pluginId={manifest.id} secrets={declaredSecrets} keyFilter={otherKeys} />
            </div>
          </PropertyGroup>
        </AccordionSection>
      )}
    </>
  );
}
