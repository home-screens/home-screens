import { ink } from '@/lib/constants';
interface ContentCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function ContentCard({ children, className, style, ...rest }: ContentCardProps) {
  return (
    <div
      {...rest}
      className={`rounded-lg ${className ?? ''}`}
      style={{
        backgroundColor: ink(0.10),
        borderTop: `1px solid ${ink(0.08)}`,
        padding: '6px 10px',
        ...style,
      }}
    >
      {children}
    </div>
  );
}
