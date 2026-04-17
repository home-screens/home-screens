'use client';

/**
 * Visual break between stacked property-panel sections (e.g. between
 * "Screen settings" and "Background", or between module AccordionSections).
 *
 * Rendered as two line segments framing three small centered dots — a
 * classic typographic section break (───── ··· ─────). Deliberately
 * composed rather than a single rule so it reads as intentional section
 * structure, not a container edge.
 *
 * Reusable anywhere two stacked sections need a visible separator.
 */
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
