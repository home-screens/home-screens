import { describe, it, expect } from 'vitest';
import { applyAllowances, codeMatches, describeHits, readSource, sourceFiles, textPieces, type GuardAllowance, type GuardHit } from './source-guards';

/**
 * Rules every surface (editor, phone, wall) keeps the same way: one spinner
 * per surface, icons drawn with lucide rather than typed as text glyphs, and
 * no em-dash in anything a person reads. These fail on each break, naming
 * what to use instead. An exception carries its reason, and one that no
 * longer allows anything fails too.
 */

const UI_FILES = sourceFiles(['src/components', 'src/app']);

export function spinHits(file: string, source: string): GuardHit[] {
  return codeMatches(file, source, /animate-spin/g).map(({ line, text }) => ({ file, line, text }));
}

/** Glyphs that only ever mean an icon. */
const ICON_GLYPHS = /[✓✕›‹♥♡↺↻↳↪▾▸▴◂▼▶◀▲]/;
const TIMES = '×';
const PLUS = '+';

/**
 * A glyph typed as an icon: ✓ ✕ › ‹ ♥ ♡, the arrows ↺ ↻ ↳ ↪ and the small
 * triangles ▾ ▸ ▴ ◂ ▼ ▶ ◀ ▲ anywhere in a file's words, a ×
 * standing alone (a close or remove button), and a + standing alone as JSX
 * text (an add button or tile). A × with a value beside it is a
 * multiplication sign, which is words: `{w} × {h}`, `×{count}`, `${n}×`,
 * "(×2)". A + beside a value is words too (`+{count}`), and so is a + in a
 * string, where code builds "+2" or "UTC+1".
 */
export function glyphIconHits(file: string, source: string): GuardHit[] {
  return textPieces(file, source, /[✓✕›‹♥♡↺↻▾▸▴◂▼▶◀▲×]|&(?:times|rsaquo|lsaquo|hearts|check|#\d+|#x[0-9a-f]+);|>\s*\+\s*</i)
    .filter((piece) => {
      const alone = piece.text.trim();
      return ICON_GLYPHS.test(piece.text)
        || (alone === TIMES && !piece.besideExpression)
        || (alone === PLUS && piece.kind === 'jsx' && !piece.besideExpression);
    })
    .map(({ line, text }) => ({ file, line, text: text.trim() }));
}

export function emDashHits(file: string, source: string): GuardHit[] {
  return textPieces(file, source, /—|&mdash;|&#8212;|\\u2014/)
    .filter((piece) => piece.text.includes('—'))
    .map(({ line, text }) => ({ file, line, text: text.trim().slice(0, 100) }));
}

function scan(find: (file: string, source: string) => GuardHit[]): GuardHit[] {
  return UI_FILES.flatMap((file) => find(file, readSource(file)));
}

describe('shared guard detectors', () => {
  it('finds icon glyphs in JSX text, entities and strings, and leaves multiplication and comments alone', () => {
    const source = [
      'const a = <button>×</button>;',
      'const b = <span>{w} × {h}</span>;',
      'const c = <span>×{count}</span>;',
      'const d = `${w}×${h}`;',
      "const e = done ? '✓' : '';",
      'const f = <span>&#8250;</span>;',
      'const g = <b>&times;</b>;',
      '// › in a comment is fine',
      "const h = `${n}×`;",
    ].join('\n');
    expect(glyphIconHits('x.tsx', source).map((h) => h.line)).toEqual([1, 5, 6, 7]);
  });

  it('finds a + typed as an add icon, and leaves a + that is words or code alone', () => {
    const source = [
      'const a = <span>+</span>;',
      'const b = <button>',
      '  +',
      '  <ChevronDown />',
      '</button>;',
      'const c = <span>+{count}</span>;',
      'const d = <span>{a} + {b}</span>;',
      "const e = offset > 0 ? '+' : '';",
      'const f = width + gap;',
      'const g = <span>+ 2 more</span>;',
    ].join('\n');
    expect(glyphIconHits('x.tsx', source).map((h) => h.line)).toEqual([1, 3]);
  });

  it('finds an em-dash in words, an entity or an escape, but not in a comment', () => {
    const source = [
      "const a = 'one — two';",
      'const b = <p>one &mdash; two</p>;',
      "const c = 'one \\u2014 two';",
      '// one — two, a comment',
      '/* one — two */',
      'const d = <p>{/* one — two */}</p>;',
    ].join('\n');
    expect(emDashHits('x.tsx', source).map((h) => h.line)).toEqual([1, 2, 3]);
  });
});

describe('spinners', () => {
  /** The two spinners, and buttons whose own refresh icon turns while they work. */
  const ALLOWED: GuardAllowance[] = [
    { file: 'src/components/ui/Spinner.tsx', reason: "is the editor's spinner" },
    { file: 'src/app/(remote)/remote/components/PhoneSpinner.tsx', reason: "is the phone's spinner" },
    { file: 'src/app/(remote)/remote/components/RetryButton.tsx', reason: 'Try again turns its own arrow while it tries' },
    { file: 'src/components/editor/BackgroundPicker.tsx', reason: 'the refresh button turns its own arrow while it refreshes' },
    { file: 'src/components/editor/settings/DisplaysIndexPage.tsx', reason: 'the refresh button turns its own arrow while it refreshes' },
    { file: 'src/components/editor/settings/MealieIntegrationCard.tsx', reason: 'the test button turns its own arrow while it tests' },
    { file: 'src/components/editor/meal-planner-modal/WeekGrid.tsx', reason: 'Suggest turns its own shuffle icon while it picks' },
  ];
  const hits = scan(spinHits);

  it('something loading uses the surface spinner', () => {
    const { offenders } = applyAllowances(hits, ALLOWED);
    expect(offenders, `Use <Spinner> / <LoadingLine> (ui/Spinner) in the editor or <PhoneSpinner> on the phone instead of animate-spin:\n${describeHits(offenders)}`).toEqual([]);
  });

  it('lists only exceptions that still apply', () => {
    expect(applyAllowances(hits, ALLOWED).stale).toEqual([]);
  });
});

describe('icons', () => {
  const ALLOWED: GuardAllowance[] = [
    { file: 'src/components/editor/settings/screen/CanvasCard.tsx', reason: 'the × between the width and height boxes is a multiplication sign' },
  ];
  const hits = scan(glyphIconHits);

  it('an icon is a lucide icon, not a typed glyph', () => {
    const { offenders } = applyAllowances(hits, ALLOWED);
    expect(offenders, `Draw these with lucide (Check, X, ChevronLeft, ChevronRight, Heart, Plus) or an IconButton, not a text glyph:\n${describeHits(offenders)}`).toEqual([]);
  });

  it('lists only exceptions that still apply', () => {
    expect(applyAllowances(hits, ALLOWED).stale).toEqual([]);
  });
});

describe('em-dashes', () => {
  it('nothing a person reads has an em-dash', () => {
    const hits = scan(emDashHits);
    expect(hits, `Use a colon, a comma, a full stop or " · " instead of an em-dash:\n${describeHits(hits)}`).toEqual([]);
  });
});
