'use client';

import { useEffect } from 'react';
import Button from '@/components/ui/Button';

interface OrientationChangeModalProps {
  offCanvasCount: number;
  totalModuleCount: number;
  newWidth: number;
  newHeight: number;
  onScaleToFit: () => void;
  onSwitchAnyway: () => void;
  onCancel: () => void;
}

export default function OrientationChangeModal({
  offCanvasCount,
  totalModuleCount,
  newWidth,
  newHeight,
  onScaleToFit,
  onSwitchAnyway,
  onCancel,
}: OrientationChangeModalProps) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md rounded-xl border border-neutral-700 bg-neutral-900 p-6 shadow-2xl">
        <h2 className="text-lg font-semibold text-neutral-100 mb-3">
          Modules may be off-screen
        </h2>

        <div className="rounded-md bg-amber-900/30 border border-amber-700/50 px-3 py-2 mb-4">
          <p className="text-xs text-amber-300">
            {offCanvasCount} of {totalModuleCount} module{totalModuleCount !== 1 ? 's' : ''}{' '}
            would extend beyond the new {newWidth}&times;{newHeight} canvas.
          </p>
        </div>

        <p className="text-sm text-neutral-400 mb-5">
          <strong className="text-neutral-300">Scale to Fit</strong> shrinks all modules
          proportionally so nothing is cut off.{' '}
          <strong className="text-neutral-300">Switch Anyway</strong> keeps modules at their
          current positions — you can reposition them manually.
        </p>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button variant="secondary" onClick={onSwitchAnyway}>Switch Anyway</Button>
          <Button variant="primary" onClick={onScaleToFit}>Scale to Fit</Button>
        </div>
      </div>
    </div>
  );
}
