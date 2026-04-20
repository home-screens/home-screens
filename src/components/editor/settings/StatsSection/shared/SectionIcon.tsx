import type { LucideIcon } from 'lucide-react';

export function SectionIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-hs-card border border-hs-border-strong text-hs-text-muted shrink-0">
      <Icon size={14} />
    </span>
  );
}
