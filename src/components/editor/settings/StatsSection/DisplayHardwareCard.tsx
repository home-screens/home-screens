'use client';

import { Monitor } from 'lucide-react';
import type { DisplayNode } from '@/types/config';
import type { DisplayStatus } from '@/lib/display-commands';
import { SectionHeading } from './shared/SectionHeading';

export function DisplayHardwareCard({
  displayStatus,
  activeDisplay,
}: {
  displayStatus: DisplayStatus | null;
  activeDisplay: DisplayNode | null;
}) {
  return (
    <section>
      <SectionHeading icon={Monitor} title="Display Hardware" />
      {displayStatus?.browserStats ? (
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-md bg-hs-hover border border-hs-border-strong px-3 py-2.5">
            <div className="text-[10px] text-hs-text-faint uppercase tracking-wider">GPU</div>
            <div className="text-xs text-hs-text-secondary mt-0.5 truncate"
                 title={displayStatus.browserStats.webglRenderer ?? 'WebGL unavailable'}>
              {displayStatus.browserStats.webglRenderer ?? 'WebGL unavailable'}
            </div>
          </div>
          <div className="rounded-md bg-hs-hover border border-hs-border-strong px-3 py-2.5">
            <div className="text-[10px] text-hs-text-faint uppercase tracking-wider">CPU cores</div>
            <div className="text-xs text-hs-text-secondary mt-0.5 font-mono tabular-nums">
              {displayStatus.browserStats.hardwareConcurrency ?? 'Unknown'}
            </div>
          </div>
          <div className="rounded-md bg-hs-hover border border-hs-border-strong px-3 py-2.5">
            <div className="text-[10px] text-hs-text-faint uppercase tracking-wider">Device memory</div>
            <div className="text-xs text-hs-text-secondary mt-0.5 font-mono tabular-nums">
              {displayStatus.browserStats.deviceMemory !== null
                ? `${displayStatus.browserStats.deviceMemory} GB`
                : 'Unknown'}
            </div>
          </div>
        </div>
      ) : (
        <p className="text-xs text-hs-text-faint">
          Browser info is reported by the display client. No display connected
          {activeDisplay ? <> for <span className="text-hs-text-secondary">{activeDisplay.name}</span></> : null}.
        </p>
      )}
    </section>
  );
}
