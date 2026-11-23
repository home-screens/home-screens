'use client';

import Toggle from '@/components/ui/Toggle';
import SectionHeading from '@/components/ui/SectionHeading';
import { useTranslate } from '@/i18n';
import type { ConfigControlsProps } from './config-controls';
import type { TextConfig } from '@/types/config';
import FieldHint from '@/components/ui/FieldHint';

export function TextFeatureControls({ config: c, set }: ConfigControlsProps<TextConfig>) {
  const t = useTranslate('editor');
  const marqueeOn = !!c.marquee;

  return (
    <>
      <SectionHeading>{t('configSections.text.sections.features')}</SectionHeading>

      <Toggle label={t('configSections.text.markdown')} checked={!!c.markdown} onChange={(v) => set({ markdown: v })} />
      {!!c.markdown && (
        <FieldHint className="pl-1">
          {t('configSections.text.markdownHint')}
        </FieldHint>
      )}
      {!marqueeOn && (
        <Toggle label={t('configSections.text.autoFit')} checked={!!c.autoFit} onChange={(v) => set({ autoFit: v })} />
      )}
      <Toggle
        label={t('configSections.text.templateVariables')}
        checked={!!c.templateVariables}
        onChange={(v) => set({ templateVariables: v })}
      />
      {!!c.templateVariables && (
        <FieldHint className="pl-1">
          {'{{time}} {{time12}} {{date}} {{day}} {{month}} {{year}} {{greeting}}'}
        </FieldHint>
      )}
    </>
  );
}
