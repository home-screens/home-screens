'use client';

import Toggle from '@/components/ui/Toggle';
import SectionHeading from '@/components/ui/SectionHeading';
import { useTranslate } from '@/i18n';
import type { ConfigControlsProps } from './config-controls';
import type { TextConfig } from '@/types/config';

export function TextFeatureControls({ config: c, set }: ConfigControlsProps<TextConfig>) {
  const t = useTranslate('editor');
  const marqueeOn = !!c.marquee;

  return (
    <>
      <SectionHeading>{t('configSections.text.sections.features')}</SectionHeading>

      <Toggle label={t('configSections.text.markdown')} checked={!!c.markdown} onChange={(v) => set({ markdown: v })} />
      {!!c.markdown && (
        <p className="text-[10px] text-hs-text-faint pl-1 leading-relaxed">
          {t('configSections.text.markdownHint')}
        </p>
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
        <p className="text-[10px] text-hs-text-faint pl-1">
          {'{{time}} {{time12}} {{date}} {{day}} {{month}} {{year}} {{greeting}}'}
        </p>
      )}
    </>
  );
}
