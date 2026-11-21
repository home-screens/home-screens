'use client';

import SecretField from '@/components/editor/settings/shared/SecretField';
import { useEditorData } from '@/hooks/useEditorData';
import type { PluginSecretDeclaration } from '@/types/plugins';
import { useTranslate } from '@/i18n';

export default function PluginSecretsSection({
  pluginId,
  secrets,
  keyFilter,
}: {
  pluginId: string;
  secrets: PluginSecretDeclaration[];
  /** When provided, render only the declarations whose key is in this list.
   *  Used to split OAuth client credentials (shown under Connection) from the
   *  plugin's other secrets. */
  keyFilter?: string[];
}) {
  const t = useTranslate('editor');
  const endpoint = `/api/plugins/secrets/${encodeURIComponent(pluginId)}`;
  const { data, error, refetch } = useEditorData<{ keys?: Record<string, boolean> }>(endpoint);
  const status = data?.keys ?? {};
  const visibleSecrets = keyFilter
    ? secrets.filter((decl) => keyFilter.includes(decl.key))
    : secrets;

  // Only until the first answer: the status is read again after every save,
  // and taking the boxes away for that would drop what is being typed in
  // the next one. A read that fails shows the boxes as not set.
  if (!data && !error) {
    return <p className="text-xs text-hs-text-faint">{t('settings.pluginSecrets.loading')}</p>;
  }

  if (visibleSecrets.length === 0) return null;

  return (
    <div className="space-y-4">
      {visibleSecrets.map((decl) => {
        const configured = !!status[decl.key];
        return (
          <SecretField
            key={decl.key}
            endpoint={endpoint}
            secretKey={decl.key}
            label={decl.label}
            placeholder={
              decl.placeholder ??
              t('settings.pluginSecrets.enterPlaceholder', { label: decl.label.toLowerCase() })
            }
            badge={decl.required && !configured ? (
              <span className="text-xs text-hs-warning">{t('settings.pluginSecrets.requiredBadge')}</span>
            ) : undefined}
            helpText={decl.description}
            helpTextClassName="mt-1.5"
            status={configured}
            onSaved={refetch}
          />
        );
      })}
    </div>
  );
}
