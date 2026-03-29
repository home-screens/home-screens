import { TEXT_OPACITY } from '@/lib/constants';

interface MetadataTextProps {
  children: React.ReactNode;
  size?: 'sm' | 'xs';
  className?: string;
}

export function MetadataText({ children, size = 'sm', className }: MetadataTextProps) {
  return (
    <span
      className={className}
      style={{ fontSize: size === 'xs' ? '0.65em' : '0.75em', opacity: TEXT_OPACITY.tertiary }}
    >
      {children}
    </span>
  );
}
