import { NextResponse } from 'next/server';
import type { PhotoSourceKind, PickImportKind } from '@/lib/photo-source';
import { UnsupportedImageFormatError } from '@/lib/library-import';
import type { MediaListItem, PhotoSource, SlideshowMediaTypes } from '@/types/config';
import { libraryPhotoSource } from './library';
import { immichPhotoSource } from './immich';
import { icloudPhotoSource } from './icloud';
import { onedrivePhotoSource } from './onedrive';
import { unsplashPhotoSource } from './unsplash';
import { nasaPhotoSource } from './nasa';
import { artPhotoSource } from './art';
import { wallPhotoSource } from './wall';
import { PhotoSourceError, type PhotoSourceAdapter, type PickableSource, type PickedPicture } from './types';

export * from './types';

const ADAPTERS: { [K in PhotoSourceKind]: PhotoSourceAdapter<K> } = {
  library: libraryPhotoSource,
  immich: immichPhotoSource,
  icloud: icloudPhotoSource,
  onedrive: onedrivePhotoSource,
  unsplash: unsplashPhotoSource,
  nasa: nasaPhotoSource,
  art: artPhotoSource,
  wall: wallPhotoSource,
};

/** The adapter for one kind of photo source. */
export function getPhotoSourceAdapter<K extends PhotoSourceKind>(kind: K): PhotoSourceAdapter<K> {
  return ADAPTERS[kind];
}

const PICKABLE: Record<PickImportKind, PickableSource> = {
  immich: immichPhotoSource,
  unsplash: unsplashPhotoSource,
  nasa: nasaPhotoSource,
};

/** The adapter that browses and copies single pictures for the picker. */
export function getPickableSource(kind: PickImportKind): PickableSource {
  return PICKABLE[kind];
}

/** A refresh of `source`, through its adapter. */
export function listPhotoSource(source: PhotoSource, count: number, media: SlideshowMediaTypes): Promise<MediaListItem[]> {
  const adapter = ADAPTERS[source.kind] as PhotoSourceAdapter<PhotoSourceKind>;
  return adapter.list({ source, count, media });
}

/** One still picture from `source` for a rotating background, through its adapter. */
export function pickOneFromSource(source: PhotoSource, canvas: { w: number; h: number }, previous?: string): Promise<PickedPicture | null> {
  const adapter = ADAPTERS[source.kind] as PhotoSourceAdapter<PhotoSourceKind>;
  return adapter.pickOne({ source, canvas, previous });
}

/** A route's answer for a failure a source explained, or null for anything else. */
export function photoSourceErrorResponse(error: unknown): NextResponse | null {
  if (error instanceof PhotoSourceError) return NextResponse.json(error.body, { status: error.status });
  if (error instanceof UnsupportedImageFormatError) return NextResponse.json({ error: error.message }, { status: 415 });
  return null;
}
