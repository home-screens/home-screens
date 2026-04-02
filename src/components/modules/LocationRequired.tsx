import { TEXT_OPACITY } from '@/lib/constants';
import type { ModuleStyle } from '@/types/config';
import ModuleWrapper from './ModuleWrapper';

export function LocationRequired({ style }: { style: ModuleStyle }) {
  return (
    <ModuleWrapper style={style}>
      <div className="flex items-center justify-center h-full" style={{ fontSize: '0.85em', opacity: TEXT_OPACITY.dim }}>
        Location not configured
      </div>
    </ModuleWrapper>
  );
}
