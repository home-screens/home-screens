'use client';

import { useTranslate } from '@/i18n';
import type { StickyNoteConfig, ModuleStyle } from '@/types/config';
import ModuleWrapper from './ModuleWrapper';
import { ModuleEmptyState } from './ModuleStates';
import { useScaledFontSize } from '@/hooks/useScaledFontSize';

interface StickyNoteModuleProps {
  config: StickyNoteConfig;
  style: ModuleStyle;
}

export default function StickyNoteModule({ config, style }: StickyNoteModuleProps) {
  const t = useTranslate('modules');
  const { containerRef, scaledFontSize } = useScaledFontSize(style.fontSize, 0.07);

  if (!config.content?.trim()) {
    return <ModuleEmptyState style={style} message={t('sticky-note.empty')} />;
  }

  const noteColor = config.noteColor ?? '#fef08a';

  const overriddenStyle: ModuleStyle = {
    ...style,
    backgroundColor: noteColor,
    textColor: '#1a1a1a',
  };

  return (
    <ModuleWrapper style={overriddenStyle}>
      <div ref={containerRef} className="h-full w-full" style={{ fontSize: `${scaledFontSize}px` }}>
        <p style={{ whiteSpace: 'pre-wrap' }}>{config.content}</p>
      </div>
    </ModuleWrapper>
  );
}
