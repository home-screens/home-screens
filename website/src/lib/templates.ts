import fs from 'node:fs';
import path from 'node:path';

// The layout files the app ships are the source of truth for the homepage
// template gallery. Name, description and module count are all read out of the
// exported layout at build time, so a card can never claim a module the
// template does not contain (which is exactly what happened when the gallery
// was hand-maintained).
const TEMPLATES_DIR = path.join(process.cwd(), '..', 'public', 'templates');

// Curated display order, by portrait layout filename stem. A template missing
// from this list simply does not appear on the homepage.
const GALLERY_ORDER = [
  'morning-dashboard',
  'family-dashboard',
  'kitchen-display',
  'productivity',
  'sports-hub',
  'news-finance',
  'photo-frame',
  'info-board',
  'minimal-clock',
  'weather-station',
];

interface LayoutFile {
  metadata?: { name?: string; description?: string };
  screens?: Array<{ modules?: unknown[] }>;
}

export interface GalleryTemplate {
  id: string;
  name: string;
  description: string;
  moduleCount: number;
}

function readTemplate(id: string): GalleryTemplate | null {
  let layout: LayoutFile;
  try {
    const raw = fs.readFileSync(path.join(TEMPLATES_DIR, `${id}.json`), 'utf8');
    layout = JSON.parse(raw) as LayoutFile;
  } catch {
    return null;
  }

  const name = layout.metadata?.name;
  const description = layout.metadata?.description;
  if (!name || !description) return null;

  const moduleCount = (layout.screens ?? []).reduce(
    (total, screen) => total + (screen.modules?.length ?? 0),
    0,
  );

  return {
    id,
    name,
    // The layout descriptions are written as sentences but stored unpunctuated.
    description: /[.!?]$/.test(description) ? description : `${description}.`,
    moduleCount,
  };
}

export function getGalleryTemplates(): GalleryTemplate[] {
  return GALLERY_ORDER.map(readTemplate).filter(
    (template): template is GalleryTemplate => template !== null,
  );
}
