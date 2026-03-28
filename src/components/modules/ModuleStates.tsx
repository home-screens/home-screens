import type { ModuleStyle } from '@/types/config';
import ModuleWrapper from './ModuleWrapper';

function SkeletonBars() {
  return (
    <div className="flex flex-col gap-2.5 w-full max-w-[70%]" aria-hidden="true">
      <div className="h-3 rounded-full bg-current opacity-[0.08] animate-pulse w-[85%]" />
      <div className="h-3 rounded-full bg-current opacity-[0.06] animate-pulse w-full" style={{ animationDelay: '150ms' }} />
      <div className="h-3 rounded-full bg-current opacity-[0.08] animate-pulse w-[60%]" style={{ animationDelay: '300ms' }} />
    </div>
  );
}

export function ModuleLoadingState({ style, message, error }: { style: ModuleStyle; message: string; error?: string | null }) {
  return (
    <ModuleWrapper style={style}>
      <div className="flex items-center justify-center h-full px-4">
        {error ? (
          <p className="text-center text-sm text-red-400/80">{error}</p>
        ) : (
          <div className="flex flex-col items-center gap-3 w-full">
            <SkeletonBars />
            <p className="text-center opacity-30 text-xs" aria-live="polite">{message}</p>
          </div>
        )}
      </div>
    </ModuleWrapper>
  );
}

export function ModuleEmptyState({ style, message }: { style: ModuleStyle; message: string }) {
  return (
    <ModuleWrapper style={style}>
      <div className="flex items-center justify-center h-full">
        <p className="text-center opacity-50">{message}</p>
      </div>
    </ModuleWrapper>
  );
}
