'use client';

interface SectionHeadingProps {
  children: React.ReactNode;
}

export default function SectionHeading({ children }: SectionHeadingProps) {
  return (
    <div className="flex items-center gap-2 pt-2">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-hs-text-faint">{children}</span>
      <div className="flex-1 border-t border-hs-border-strong/50" />
    </div>
  );
}
