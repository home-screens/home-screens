import type { ShapeConfig } from '@/types/config';

/** Props for a config-section child that edits one slice of a module's config. */
export interface ConfigControlsProps<T> {
  config: T;
  set: (updates: Partial<T>) => void;
}

/** Shape children receive the parent's already-resolved view. */
export type ShapeControlsProps = ConfigControlsProps<ShapeConfig> & {
  view: ShapeConfig['view'];
};
