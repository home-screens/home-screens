'use client';

/** Rule-dots-rule divider between stacked property-panel sections. */
export default function SectionDivider() {
  return (
    <div
      className="flex items-center justify-center gap-3 py-4"
      aria-hidden
    >
      <div className="flex-1 h-px bg-hs-border-strong" />
      <div className="flex items-center gap-1.5">
        <span className="h-1 w-1 rounded-full bg-hs-text-faint" />
        <span className="h-1 w-1 rounded-full bg-hs-text-faint" />
        <span className="h-1 w-1 rounded-full bg-hs-text-faint" />
      </div>
      <div className="flex-1 h-px bg-hs-border-strong" />
    </div>
  );
}
