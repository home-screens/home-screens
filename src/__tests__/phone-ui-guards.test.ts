import { describe, it, expect } from 'vitest';
import { applyAllowances, codeMatches, describeHits, readSource, sourceFiles, type GuardAllowance, type GuardHit } from './source-guards';

/**
 * The phone (`/remote`, `/chores`) is styled inline from one set of shared
 * pieces, so a hand-written copy is how it drifts: a sheet stacked at a
 * number nobody else knows, a colour that does not turn with the theme, a
 * save button that is almost the amber one. These fail on each, naming the
 * shared piece to use. An exception carries its reason, and one that no
 * longer allows anything fails too, so the lists only shrink.
 */

const PHONE_FILES = [
  ...sourceFiles(['src/app/(remote)']),
  ...sourceFiles(['src/components/family', 'src/components/custom-icons'], /^Phone/),
  'src/components/meals/MealTimeChip.tsx',
];

/** Where the phone's shared styles and layers are defined; the checks are about everywhere else. */
const REMOTE_STYLES = 'src/app/(remote)/remote/components/remote-styles.ts';
const REMOTE_LAYERS_FILE = 'src/app/(remote)/remote/components/remote-layers.ts';

function shortLine(source: string, line: number): string {
  const text = source.split('\n')[line - 1].trim();
  return text.length > 110 ? `${text.slice(0, 107)}...` : text;
}

/** `zIndex: <value>`, a CSS `z-index:` and Tailwind's `z-20` / `z-[60]`. */
const Z_INDEX = /zIndex\s*:\s*[^,}\n]+|z-index\s*:\s*[^;'"`\n]+|(?<![\w-])z-(?:\d+|\[\d+\])(?![\w-])/g;

/** A stacking value written as a number rather than a `REMOTE_LAYERS` rung (a rung plus one is still a rung). */
export function zIndexHits(file: string, source: string): GuardHit[] {
  return codeMatches(file, source, Z_INDEX)
    .filter(({ text }) => /\d/.test(text) && !text.includes('REMOTE_LAYERS'))
    .map(({ line, text }) => ({ file, line, text: text.trim() }));
}

const COLOUR = /(?<![&\w])#[0-9a-fA-F]{3,8}(?![\w-])|rgba?\(/g;
/** A black shadow is depth, not a colour: there is no theme token for it and it needs none. */
const BLACK = /^rgba?\(\s*0\s*,\s*0\s*,\s*0\s*[,)]/;

/** A hex or rgb() colour, other than a black shadow, as the line it is on. */
export function colourHits(file: string, source: string): GuardHit[] {
  const lines = source.split('\n');
  return codeMatches(file, source, COLOUR)
    .filter(({ line, match }) => !(/shadow/i.test(lines[line - 1]) && BLACK.test(source.slice(match.index))))
    .map(({ line }) => ({ file, line, text: shortLine(source, line) }));
}

/** The object literal around a position, braces balanced. */
function enclosingObject(source: string, at: number): string {
  let start = at;
  for (let depth = 0; start > 0; start--) {
    const ch = source[start - 1];
    if (ch === '}') depth++;
    else if (ch === '{') {
      if (depth === 0) break;
      depth--;
    }
  }
  let end = at;
  for (let depth = 0; end < source.length; end++) {
    const ch = source[end];
    if (ch === '{') depth++;
    else if (ch === '}') {
      if (depth === 0) break;
      depth--;
    }
  }
  return source.slice(start, end);
}

const BACKGROUND = /background(?:Color)?\s*:\s*[^,}\n]*/g;

/**
 * The save button's look written by hand: a solid `REMOTE_ACCENT` fill (not
 * a `withAlpha` wash) with `REMOTE_ON_ACCENT` ink in the same style object.
 */
export function amberButtonHits(file: string, source: string): GuardHit[] {
  return codeMatches(file, source, BACKGROUND)
    .filter(({ text, match }) => {
      // The match stops at the first comma, so a wash can be cut off before its `)`.
      const solid = text.replace(/(?:withAlpha|color-mix)\([^)]*\)?/g, '');
      return /\bREMOTE_ACCENT\b/.test(solid) && enclosingObject(source, match.index).includes('REMOTE_ON_ACCENT');
    })
    .map(({ line }) => ({ file, line, text: shortLine(source, line) }));
}

function scan(find: (file: string, source: string) => GuardHit[], skip: string): GuardHit[] {
  return PHONE_FILES.filter((file) => file !== skip).flatMap((file) => find(file, readSource(file)));
}

describe('phone guard detectors', () => {
  it('reads a number as a stray layer, and a rung (or a rung plus one) as fine', () => {
    const source = [
      'const a = { zIndex: 120 };',
      'const b = { zIndex: REMOTE_LAYERS.sheet };',
      'const c = { zIndex: REMOTE_LAYERS.pageChrome + 1 };',
      '<div className="sticky z-20" />',
      '// zIndex: 999 in a comment is not code',
    ].join('\n');
    expect(zIndexHits('x.tsx', source).map((h) => `${h.line}: ${h.text}`)).toEqual(['1: zIndex: 120', '4: z-20']);
  });

  it('flags colours but not a black shadow or an entity', () => {
    const source = [
      "const a = { color: '#fff' };",
      "const b = { boxShadow: '0 8px 24px rgba(0,0,0,0.35)' };",
      "const c = { boxShadow: '0 0 8px rgba(34,197,94,0.4)' };",
      "const d = { background: 'rgba(0,0,0,0.6)' };",
      'const e = <span>&#215;</span>;',
    ].join('\n');
    expect(colourHits('x.tsx', source).map((h) => h.line)).toEqual([1, 3, 4]);
  });

  it('flags an amber fill with dark ink, not an amber wash or a fill without ink', () => {
    const source = [
      'const save = { width: 1, background: REMOTE_ACCENT, color: REMOTE_ON_ACCENT };',
      'const chip = { background: on ? withAlpha(REMOTE_ACCENT, 0.15) : x, color: REMOTE_ON_ACCENT };',
      'const dot = { width: 6, background: REMOTE_ACCENT };',
      "const pick = { background: on ? REMOTE_ACCENT : 'var(--hs-bg-card)', color: on ? REMOTE_ON_ACCENT : 'inherit' };",
    ].join('\n');
    expect(amberButtonHits('x.tsx', source).map((h) => h.line)).toEqual([1, 4]);
  });
});

describe('phone stacking order', () => {
  /** A local order inside one component, where a page layer would be wrong. */
  const ALLOWED: GuardAllowance[] = [
    { file: 'src/app/(remote)/remote/components/FormOverlay.tsx', match: 'zIndex: 1', reason: "lifts a form's footer over its own scrolling body" },
    { file: 'src/app/(remote)/remote/components/ListsItemRow.tsx', match: 'zIndex: isDragging ? 2', reason: 'keeps the row being dragged above the rows it passes' },
  ];
  const hits = scan(zIndexHits, REMOTE_LAYERS_FILE);

  it('every overlay and pinned bar takes its rung from REMOTE_LAYERS', () => {
    const { offenders } = applyAllowances(hits, ALLOWED);
    expect(offenders, `Stack these with REMOTE_LAYERS (remote-layers.ts), or a sheet shell's \`layer\` prop, not a number:\n${describeHits(offenders)}`).toEqual([]);
  });

  it('lists only exceptions that still apply', () => {
    expect(applyAllowances(hits, ALLOWED).stale).toEqual([]);
  });
});

describe('phone colours', () => {
  /** Surfaces that look the same in both themes on purpose. */
  const ALLOWED: GuardAllowance[] = [
    { file: 'src/app/(remote)/remote/components/PhotoViewer.tsx', reason: 'the photo viewer is dark in both themes, like a camera roll' },
    { file: 'src/app/(remote)/remote/components/PhotoGrid.tsx', reason: 'marks drawn on top of a photo need the same contrast in either theme' },
    { file: 'src/app/(remote)/remote/components/TimerViewThumb.tsx', reason: "draws each wall timer look in that look's own colours" },
    { file: 'src/app/(remote)/remote/components/DayCompleteSheet.tsx', reason: 'confetti in party colours, the same as the wall celebration' },
    { file: 'src/app/(remote)/remote/components/SheetFrame.tsx', match: 'rgba(0,0,0,0.6)', reason: 'the dim behind every sheet, drawn once by the one sheet shell' },
    { file: 'src/components/custom-icons/PhoneCustomIconSection.tsx', match: 'rgba(0,0,0,0.75)', reason: "the moving-picture mark sits on the icon's own artwork" },
    { file: 'src/components/custom-icons/PhoneCustomIconReviewSheet.tsx', match: '#f4efe6', reason: "previews a new icon on the wall's light card colour" },
  ];
  const hits = scan(colourHits, REMOTE_STYLES);

  it('every colour is a theme token or a remote-styles export', () => {
    const { offenders } = applyAllowances(hits, ALLOWED);
    expect(offenders, `Use a var(--hs-*) token, a remote-styles.ts export (REMOTE_ACCENT, REMOTE_ACCENT_INK, REMOTE_ON_ACCENT) or memberInk() instead of a colour literal:\n${describeHits(offenders)}`).toEqual([]);
  });

  it('lists only exceptions that still apply', () => {
    expect(applyAllowances(hits, ALLOWED).stale).toEqual([]);
  });
});

describe('phone amber buttons', () => {
  /** Amber with dark ink that is not a labelled "do it" button: icon-only, a pill in a row, a chip, a mark. */
  const ALLOWED: GuardAllowance[] = [
    { file: 'src/app/(remote)/remote/components/ConfirmSheet.tsx', reason: "a question's own answer, coloured by its tone" },
    { file: 'src/app/(remote)/remote/components/SquareAddButton.tsx', reason: 'the square + at the end of an add box' },
    { file: 'src/app/(remote)/remote/components/MealsLibraryView.tsx', reason: 'the floating + over the library' },
    { file: 'src/app/(remote)/remote/components/SlideshowControls.tsx', reason: 'the round play and pause button' },
    { file: 'src/app/(remote)/remote/components/BonusChoreRow.tsx', reason: 'the small Grab pill at the end of a bonus chore row' },
    { file: 'src/app/(remote)/remote/components/StarterChoresOverlay.tsx', reason: 'the round weekday chip, chosen' },
    { file: 'src/app/(remote)/remote/components/MealsMealieGroceryView.tsx', reason: 'Open Mealie and Try again keep the shape of the quiet buttons beside them' },
    { file: 'src/app/(remote)/remote/components/PhotoGrid.tsx', reason: 'the tick on a chosen photo, not a button' },
  ];
  const hits = scan(amberButtonHits, REMOTE_STYLES);

  it('an amber button with dark ink is a PrimaryButton', () => {
    const { offenders } = applyAllowances(hits, ALLOWED);
    expect(offenders, `Use <PrimaryButton> (or primaryButtonStyle() where it is not a <button>) for an amber button:\n${describeHits(offenders)}`).toEqual([]);
  });

  it('lists only exceptions that still apply', () => {
    expect(applyAllowances(hits, ALLOWED).stale).toEqual([]);
  });
});
