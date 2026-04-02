'use client';

import type { TodoConfig, ModuleStyle } from '@/types/config';
import ModuleWrapper from './ModuleWrapper';
import { ModuleEmptyState } from './ModuleStates';
import { TEXT_OPACITY, DIVIDER } from '@/lib/constants';
import { MetadataText } from './shared/MetadataText';
import { useScaledFontSize } from '@/hooks/useScaledFontSize';

interface TodoModuleProps {
  config: TodoConfig;
  style: ModuleStyle;
}

function CheckIcon({ done, color }: { done: boolean; color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" className="shrink-0" style={{ marginTop: '0.1em' }}>
      {done ? (
        <>
          <rect x="1" y="1" width="16" height="16" rx="4" fill={color} />
          <path d="M5.5 9.5L7.5 11.5L12.5 6.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </>
      ) : (
        <rect x="1" y="1" width="16" height="16" rx="4" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" />
      )}
    </svg>
  );
}

export default function TodoModule({ config, style }: TodoModuleProps) {
  const title = config.title ?? 'To Do';
  const { containerRef, scaledFontSize } = useScaledFontSize(style.fontSize, 0.06);
  const accentColor = config.accentColor ?? '#000000';

  if (!config.items || config.items.length === 0) {
    return <ModuleEmptyState style={style} message="No tasks yet" />;
  }

  const doneCount = config.items.filter((i) => i.completed).length;
  const totalCount = config.items.length;

  return (
    <ModuleWrapper style={style}>
      <div ref={containerRef} className="flex flex-col h-full" style={{ fontSize: `${scaledFontSize}px` }}>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-semibold" style={{ fontSize: '1.25em' }}>
            {title}
          </h2>
          <MetadataText className="tabular-nums">
            {doneCount}/{totalCount}
          </MetadataText>
        </div>
        <ul className="flex flex-col">
          {config.items.map((item, i) => (
            <li
              key={item.id}
              className="flex items-start gap-2 py-1.5"
              style={{
                borderBottom: i < config.items.length - 1 ? `1px solid ${DIVIDER.default}` : 'none',
                opacity: item.completed ? TEXT_OPACITY.tertiary : TEXT_OPACITY.primary,
              }}
            >
              <CheckIcon done={item.completed} color={accentColor} />
              <span
                className="line-clamp-2"
                style={{
                  textDecoration: item.completed ? 'line-through' : 'none',
                  textDecorationColor: item.completed ? accentColor : undefined,
                }}
              >
                {item.text}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </ModuleWrapper>
  );
}
