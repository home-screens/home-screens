import type { BackgroundRotation, BackgroundRotationSourceId } from '@/types/config';

export interface Canvas {
  w: number;
  h: number;
}

export interface BackgroundSourceProvider {
  id: BackgroundRotationSourceId;
  fetchRandom(rotation: BackgroundRotation, canvas: Canvas | undefined): Promise<string | null>;
}
