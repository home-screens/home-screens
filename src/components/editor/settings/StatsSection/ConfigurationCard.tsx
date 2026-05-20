'use client';

import { SlidersHorizontal } from 'lucide-react';
import { useTranslate } from '@/i18n';
import { SectionHeading } from './shared/SectionHeading';
import { CountTile } from './shared/CountTile';
import { ModulesCard } from './ModulesCard';
import { IntegrationsCard } from './IntegrationsCard';
import type { SystemStats } from './types';

export function ConfigurationCard({ stats }: { stats: SystemStats }) {
  const t = useTranslate('editor');
  return (
    <section>
      <SectionHeading icon={SlidersHorizontal} title={t('settings.statsSection.configurationTitle')} />

      <div className="grid grid-cols-3 gap-3">
        <CountTile label={t('settings.statsSection.screens')}  value={stats.app.screens} />
        <CountTile label={t('settings.statsSection.modules')}  value={stats.app.modules} />
        <CountTile label={t('settings.statsSection.profiles')} value={stats.app.profiles} />
      </div>

      <ModulesCard stats={stats} />
      <IntegrationsCard stats={stats} />
    </section>
  );
}
