'use client';

import { useState, type ReactNode } from 'react';
import { useElementBox } from '@/hooks/useElementBox';
import type { LayoutProps } from './types';
import { TargetPicker } from './TargetPicker';
import { controlMetrics, type ControlMetrics } from './metrics';

interface ControlFrame {
  /** Goes on the layout's root, the box everything is sized from. */
  boxRef: (el: HTMLDivElement | null) => void;
  m: ControlMetrics;
  showPicker: boolean;
  /** The "which display" picker, or nothing when this module has one target. */
  picker: ReactNode;
  /** The class that fades the controls while the picker's list is open. */
  dim: string;
}

/**
 * What every layout starts with: measure the box, size the controls from it,
 * and build the display picker. A layout whose picker opens over its
 * controls fades them while it is open; the bar's opens beside them, so it
 * asks for no fade.
 */
export function useControlFrame(
  props: LayoutProps,
  layout: 'bar' | 'pad' | 'panel' | 'nav',
  { fadeWhilePicking = true }: { fadeWhilePicking?: boolean } = {},
): ControlFrame {
  const { allowRetargeting, compact, isLegacyMode, availableDisplays, currentTarget, setCurrentTarget, selfId, onTimers } = props;
  const [pickerOpen, setPickerOpen] = useState(false);
  const showPicker = allowRetargeting && !isLegacyMode;
  const [boxRef, box] = useElementBox('padding');
  const m = controlMetrics({ w: box.width, h: box.height, layout, compact, showPicker, timers: onTimers !== undefined });
  const picker = showPicker ? (
    <TargetPicker
      value={currentTarget}
      onChange={(v) => setCurrentTarget(v)}
      options={availableDisplays}
      selfId={selfId}
      onOpenChange={fadeWhilePicking ? setPickerOpen : undefined}
      m={m}
    />
  ) : null;
  return { boxRef, m, showPicker, picker, dim: pickerOpen ? 'opacity-35' : '' };
}
