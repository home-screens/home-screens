'use client';

import { Undo2, Redo2, ZoomIn, ZoomOut, Maximize, Grid3x3 } from 'lucide-react';
import type { TranslateFn } from '@/i18n';
import { MIN_ZOOM, MAX_ZOOM } from '@/hooks/useCanvasZoom';

interface CanvasToolbarProps {
  t: TranslateFn;
  canUndo: boolean;
  canRedo: boolean;
  snapEnabled: boolean;
  userZoom: number;
  onUndo: () => void;
  onRedo: () => void;
  onToggleSnap: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
}

/** Floating bottom toolbar: undo/redo, snap toggle, and zoom controls. */
export default function CanvasToolbar({
  t,
  canUndo,
  canRedo,
  snapEnabled,
  userZoom,
  onUndo,
  onRedo,
  onToggleSnap,
  onZoomIn,
  onZoomOut,
  onResetZoom,
}: CanvasToolbarProps) {
  return (
    <div className="absolute bottom-3 left-1/2 z-50 flex -translate-x-1/2 items-center gap-0.5 rounded-lg border border-hs-border-strong bg-hs-panel/90 px-1 py-0.5 backdrop-blur-sm">
      {/* Undo / Redo */}
      <button
        onClick={onUndo}
        disabled={!canUndo}
        className="rounded p-1.5 text-hs-text-muted transition-colors hover:bg-hs-card hover:text-hs-text-body disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-hs-text-muted"
        title={t('canvas.undoTitle')}
        aria-label={t('canvas.undoAriaLabel')}
      >
        <Undo2 className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={onRedo}
        disabled={!canRedo}
        className="rounded p-1.5 text-hs-text-muted transition-colors hover:bg-hs-card hover:text-hs-text-body disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-hs-text-muted"
        title={t('canvas.redoTitle')}
        aria-label={t('canvas.redoAriaLabel')}
      >
        <Redo2 className="h-3.5 w-3.5" />
      </button>

      <div className="mx-0.5 h-4 w-px bg-hs-card" />

      {/* Snap toggle */}
      <button
        onClick={onToggleSnap}
        className={`rounded p-1.5 transition-colors ${
          snapEnabled
            ? 'text-hs-accent-hover hover:bg-hs-card hover:text-hs-accent-hover'
            : 'text-hs-text-muted hover:bg-hs-card hover:text-hs-text-body'
        }`}
        title={snapEnabled ? t('canvas.snapOnTitle') : t('canvas.snapOffTitle')}
        aria-label={snapEnabled ? t('canvas.snapOnTitle') : t('canvas.snapOffTitle')}
        aria-pressed={snapEnabled}
      >
        <Grid3x3 className="h-3.5 w-3.5" />
      </button>

      <div className="mx-0.5 h-4 w-px bg-hs-card" />

      {/* Zoom controls */}
      <button
        onClick={onZoomOut}
        disabled={userZoom <= MIN_ZOOM}
        className="rounded p-1.5 text-hs-text-muted transition-colors hover:bg-hs-card hover:text-hs-text-body disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-hs-text-muted"
        title={t('canvas.zoomOutTitle')}
        aria-label={t('canvas.zoomOutAriaLabel')}
      >
        <ZoomOut className="h-3.5 w-3.5" />
      </button>
      <span className="min-w-[3.25rem] select-none text-center text-xs tabular-nums text-hs-text-muted">
        {t('canvas.zoomPercent', { percent: Math.round(userZoom * 100) })}
      </span>
      <button
        onClick={onZoomIn}
        disabled={userZoom >= MAX_ZOOM}
        className="rounded p-1.5 text-hs-text-muted transition-colors hover:bg-hs-card hover:text-hs-text-body disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-hs-text-muted"
        title={t('canvas.zoomInTitle')}
        aria-label={t('canvas.zoomInAriaLabel')}
      >
        <ZoomIn className="h-3.5 w-3.5" />
      </button>

      {userZoom !== 1.0 && (
        <>
          <div className="mx-0.5 h-4 w-px bg-hs-card" />
          <button
            onClick={onResetZoom}
            className="rounded p-1.5 text-hs-text-muted transition-colors hover:bg-hs-card hover:text-hs-text-body"
            title={t('canvas.fitTitle')}
            aria-label={t('canvas.fitAriaLabel')}
          >
            <Maximize className="h-3.5 w-3.5" />
          </button>
        </>
      )}
    </div>
  );
}
