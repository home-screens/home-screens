import type { LucideIcon } from 'lucide-react';
import { SectionIcon } from './SectionIcon';

export function SectionHeading({ icon, title, trailing }: {
  icon: LucideIcon;
  title: string;
  trailing?: React.ReactNode;
}) {
  return (
    // Column on narrow viewports so wide trailing buttons (e.g. the Server
    // section's "Diagnostics bundle" + "Refresh" pair) don't crash into the
    // heading or force their labels to wrap internally. Side-by-side once
    // there's room.
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-3 gap-2 sm:gap-3">
      <div className="flex items-center gap-2.5 min-w-0">
        <SectionIcon icon={icon} />
        <h3 className="text-[11px] font-medium text-hs-text-secondary uppercase tracking-[0.08em] truncate">
          {title}
        </h3>
      </div>
      {trailing ? <div className="flex items-center gap-2 flex-wrap">{trailing}</div> : null}
    </div>
  );
}
