/**
 * The backgrounds that ship with Home Screens.
 *
 * A fresh install used to open the background picker on Unsplash, dead-end in
 * "add a free API key", and offer nothing else — so the first thing anyone
 * wants to change ("make the wall not black") needed a signup first. These
 * eight gradients live in `public/backgrounds/themes/` as SVGs, so they cost a
 * few hundred bytes, need no key, and render at any display size.
 */
export interface StarterBackground {
  id: string;
  path: string;
  /** CSS gradient mirroring the SVG, for the picker's own thumbnails. */
  swatch: string;
}

export const STARTER_BACKGROUNDS: StarterBackground[] = [
  { id: 'midnight', path: '/backgrounds/themes/midnight.svg', swatch: 'linear-gradient(160deg,#0f2027,#203a43 55%,#2c5364)' },
  { id: 'dusk', path: '/backgrounds/themes/dusk.svg', swatch: 'linear-gradient(160deg,#3a1c71,#d76d77 60%,#ffaf7b)' },
  { id: 'forest', path: '/backgrounds/themes/forest.svg', swatch: 'linear-gradient(160deg,#134e5e,#71b280)' },
  { id: 'deep-blue', path: '/backgrounds/themes/deep-blue.svg', swatch: 'linear-gradient(160deg,#1e3c72,#2a5298)' },
  { id: 'charcoal', path: '/backgrounds/themes/charcoal.svg', swatch: 'linear-gradient(160deg,#232526,#414345)' },
  { id: 'sunrise', path: '/backgrounds/themes/sunrise.svg', swatch: 'linear-gradient(160deg,#ff7e5f,#feb47b)' },
  { id: 'plum', path: '/backgrounds/themes/plum.svg', swatch: 'linear-gradient(160deg,#41295a,#2f0743)' },
  { id: 'aurora', path: '/backgrounds/themes/aurora.svg', swatch: 'linear-gradient(160deg,#0f3443,#34e89e)' },
];
