import { TEXT_OPACITY } from '@/lib/constants';

interface SectionHeaderProps {
  children: React.ReactNode;
  className?: string;
  active?: boolean;
}

export function SectionHeader({ children, className, active }: SectionHeaderProps) {
  return (
    <span
      className={`uppercase tracking-widest font-semibold ${className ?? ''}`}
      style={{ fontSize: '0.7em', opacity: active == null ? TEXT_OPACITY.secondary : active ? TEXT_OPACITY.primary : TEXT_OPACITY.tertiary }}
    >
      {children}
    </span>
  );
}
