'use client';

import { SlidersHorizontal } from 'lucide-react';
import { SectionHeading } from './shared/SectionHeading';
import { CountTile } from './shared/CountTile';
import { ModulesCard } from './ModulesCard';
import { IntegrationsCard } from './IntegrationsCard';
import type { SystemStats } from './types';

export function ConfigurationCard({ stats }: { stats: SystemStats }) {
  return (
    <section>
      <SectionHeading icon={SlidersHorizontal} title="Configuration" />

      <div className="grid grid-cols-3 gap-3">
        <CountTile label="Screens"  value={stats.app.screens} />
        <CountTile label="Modules"  value={stats.app.modules} />
        <CountTile label="Profiles" value={stats.app.profiles} />
      </div>

      <ModulesCard stats={stats} />
      <IntegrationsCard stats={stats} />
    </section>
  );
}
