'use client';

import type { CSSProperties } from 'react';
import { useTranslate } from '@/i18n';
import type { IconConfig, ModuleStyle } from '@/types/config';
import ModuleWrapper from './ModuleWrapper';
import { ModuleEmptyState } from './ModuleStates';
import { buildIconClass } from '@/lib/font-awesome-icons';

interface IconModuleProps {
  config: IconConfig;
  style: ModuleStyle;
}

const ANIMATION_CLASS: Record<IconConfig['animation'], string> = {
  'none': '',
  'spin': 'fa-spin',
  'spin-pulse': 'fa-spin-pulse',
  'spin-reverse': 'fa-spin fa-spin-reverse',
  'beat': 'fa-beat',
  'fade': 'fa-fade',
  'beat-fade': 'fa-beat-fade',
  'bounce': 'fa-bounce',
  'shake': 'fa-shake',
  'flip': 'fa-flip',
};

const FLIP_CLASS: Record<IconConfig['flip'], string> = {
  'none': '',
  'horizontal': 'fa-flip-horizontal',
  'vertical': 'fa-flip-vertical',
  'both': 'fa-flip-both',
};

export default function IconModule({ config, style }: IconModuleProps) {
  const t = useTranslate('modules');
  const iconClass = buildIconClass(config.iconName ?? '', config.style ?? 'solid');

  if (!iconClass) {
    return <ModuleEmptyState style={style} type="icon" message={t('icon.empty')} />;
  }

  const rotation = config.rotation ?? 0;
  const flip = config.flip ?? 'none';
  const animation = config.animation ?? 'none';
  const scale = config.autoFit ? 0.85 : Math.max(0.05, Math.min(1, config.scale ?? 0.7));
  const animationDuration = Math.max(0.1, config.animationDuration ?? 2);

  const rotationClass = rotation !== 0 ? `fa-rotate-${rotation}` : '';
  const flipClass = FLIP_CLASS[flip];
  const animationClass = ANIMATION_CLASS[animation];

  const fullClass = [iconClass, rotationClass, flipClass, animationClass]
    .filter(Boolean)
    .join(' ');

  // Container queries let the icon scale fluidly with the module box without
  // any JS measurement. `cqmin` is the smaller of container width / height,
  // so the glyph stays inside the box on both portrait and landscape sizes.
  const wrapperStyle: CSSProperties = {
    containerType: 'size',
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: config.iconBackground && config.iconBackground !== 'transparent'
      ? config.iconBackground
      : undefined,
    borderRadius: 'inherit',
  };

  // Font Awesome animation classes read these CSS custom properties; setting
  // --fa-animation-duration on the icon scales every supported animation.
  const iconStyle: CSSProperties & Record<`--${string}`, string | number> = {
    fontSize: `${scale * 100}cqmin`,
    color: config.color || 'currentColor',
    lineHeight: 1,
    '--fa-animation-duration': `${animationDuration}s`,
  };

  return (
    <ModuleWrapper style={style}>
      <div style={wrapperStyle}>
        <i className={fullClass} style={iconStyle} aria-hidden="true" />
      </div>
    </ModuleWrapper>
  );
}
