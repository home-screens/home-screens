import { readdirSync } from 'fs';
import path from 'path';
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

/**
 * An em-dash in a Markdown or HTML page, frontmatter included, outside its
 * `<!-- -->` comments. A code sample is read too, so it counts.
 */
export function pageEmDashHits(file: string, source: string): GuardHit[] {
  const uncommented = source.replace(/<!--[\s\S]*?-->/g, (comment) => comment.replace(/[^\n]/g, ' '));
  return uncommented.split('\n').flatMap((text, i) =>
    /—|&mdash;|&#8212;|&#x2014;/i.test(text) ? [{ file, line: i + 1, text: text.trim().slice(0, 100) }] : []);
}

/** Repo-relative paths of the files under `root` whose names match `include`, skipping the `skip` folders. */
function filesUnder(root: string, include: RegExp, skip: string[] = []): string[] {
  const walk = (dir: string): string[] =>
    readdirSync(path.join(process.cwd(), dir), { withFileTypes: true }).flatMap((entry) => {
      const rel = path.join(dir, entry.name);
      if (entry.isDirectory()) return entry.name === 'node_modules' || entry.name === '__tests__' || skip.includes(rel) ? [] : walk(rel);
      return include.test(entry.name) && !/\.test\./.test(entry.name) ? [rel] : [];
    });
  return walk(root).sort();
}

/**
 * The marketing site. Its code is read like the app's, comments left out;
 * the Markdoc helpers are plain JS with JSX in them, so they are parsed as
 * TSX. Its pages are the Markdown under website/content apart from the
 * generated schema, and the social card. Release notes are not here: the
 * changelog renders them from RELEASE_NOTES/, which is history and stays
 * as written.
 */
const WEBSITE_CODE = [...sourceFiles(['website/src']), ...filesUnder('website/src', /\.m?js$/)].sort();
const WEBSITE_PAGES = [...filesUnder('website/content', /\.md$/, ['website/content/generated']), 'website/og-image.html'];

function websiteCodeEmDashHits(file: string, source: string): GuardHit[] {
  const parseAs = /\.m?js$/.test(file) ? `${file}.tsx` : file;
  return emDashHits(parseAs, source).map((hit) => ({ ...hit, file }));
}

function scan(find: (file: string, source: string) => GuardHit[], files: string[] = UI_FILES): GuardHit[] {
  return files.flatMap((file) => find(file, readSource(file)));
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

  it('finds an em-dash anywhere in a page, frontmatter and entities included, but not in an HTML comment', () => {
    const source = [
      '---',
      'description: one — two',
      '---',
      '<!-- one — two -->',
      '<!--',
      '  one — two',
      '-->',
      'One &mdash; two.',
      'One, two: three.',
      '`one — two`',
    ].join('\n');
    expect(pageEmDashHits('x.md', source)).toEqual([
      { file: 'x.md', line: 2, text: 'description: one — two' },
      { file: 'x.md', line: 8, text: 'One &mdash; two.' },
      { file: 'x.md', line: 10, text: '`one — two`' },
    ]);
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

  it('nothing on the website has an em-dash', () => {
    expect(WEBSITE_CODE.some((file) => file.endsWith('.js'))).toBe(true);
    expect(WEBSITE_PAGES).toEqual(expect.arrayContaining(['website/content/docs/index.md', 'website/content/blog/introducing-home-screens.md', 'website/content/legal/privacy.md']));
    const hits = [...scan(websiteCodeEmDashHits, WEBSITE_CODE), ...scan(pageEmDashHits, WEBSITE_PAGES)];
    expect(hits, `Instead of an em-dash, use " · " in a title and a colon, a comma, parentheses or a full stop elsewhere:\n${describeHits(hits)}`).toEqual([]);
  });
});
