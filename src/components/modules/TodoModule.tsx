'use client';

import type { TodoConfig, ModuleStyle } from '@/types/config';
import ModuleWrapper from './ModuleWrapper';
import { ModuleEmptyState } from './ModuleStates';
import { TEXT_OPACITY } from '@/lib/constants';
import { useScaledFontSize } from '@/hooks/useScaledFontSize';

interface TodoModuleProps {
  config: TodoConfig;
  style: ModuleStyle;
}

export default function TodoModule({ config, style }: TodoModuleProps) {
  const title = config.title ?? 'To Do';
  const { containerRef, scaledFontSize } = useScaledFontSize(style.fontSize, 0.06);

  if (!config.items || config.items.length === 0) {
    return <ModuleEmptyState style={style} message="No tasks yet" />;
  }

  return (
    <ModuleWrapper style={style}>
      <div ref={containerRef} className="flex flex-col h-full" style={{ fontSize: `${scaledFontSize}px` }}>
        <h2 className="font-semibold mb-3" style={{ fontSize: '1.25em' }}>
          {title}
        </h2>
        <ul className="space-y-1">
          {config.items.map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-2"
              style={{
                textDecoration: item.completed ? 'line-through' : 'none',
                opacity: item.completed ? TEXT_OPACITY.tertiary : TEXT_OPACITY.primary,
              }}
            >
              <span>{item.completed ? '\u2611' : '\u2610'}</span>
              <span className="line-clamp-2">{item.text}</span>
            </li>
          ))}
        </ul>
      </div>
    </ModuleWrapper>
  );
}
