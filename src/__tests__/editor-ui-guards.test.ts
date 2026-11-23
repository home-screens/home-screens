import { describe, it, expect } from 'vitest';
import { applyAllowances, codeMatches, describeHits, readSource, sourceFiles, textPieces, type GuardAllowance, type GuardHit } from './source-guards';

/**
 * The editor draws its chrome from `src/components/ui/` and its colours from
 * the `hs-*` theme tokens, so it reads the same in the light and dark theme.
 * These fail on the copies that drift from that: a Tailwind palette colour
 * that does not follow the theme, a full-screen layer that is not a window,
 * a switch built by hand. Each names the shared piece to use. An exception
 * carries its reason, and one that no longer allows anything fails too.
 */

const EDITOR_FILES = sourceFiles(['src/components/editor', 'src/components/ui', 'src/app/(editor)', 'src/app/(connect)']);

/** A Tailwind palette colour class (`text-red-500`, `border-t-amber-400/30`), which ignores the theme. */
const PALETTE =
  /(?<![\w-])(?:text|bg|border(?:-[trblxyse])?|ring|fill|stroke|from|to|via)-(?:red|amber|yellow|green|emerald|blue|sky|indigo|violet|purple|pink|rose|orange|lime|teal|cyan|slate|gray|zinc|neutral|stone)-\d+/g;

export function paletteHits(file: string, source: string): GuardHit[] {
  return codeMatches(file, source, PALETTE).map(({ line, text }) => ({ file, line, text }));
}

/** A class list that pins a layer over the whole page. */
export function fullScreenLayerHits(file: string, source: string): GuardHit[] {
  return textPieces(file, source, /inset-0/)
    .filter((piece) => /(?<![\w-])fixed(?![\w-])/.test(piece.text) && /(?<![\w-])inset-0(?![\w-])/.test(piece.text))
    .map(({ line, text }) => ({ file, line, text: text.trim() }));
}

const SWITCH_ROLE = /role\s*=\s*\{?\s*(['"])switch\1|role\s*:\s*(['"])switch\2/g;

export function switchHits(file: string, source: string): GuardHit[] {
  return codeMatches(file, source, SWITCH_ROLE).map(({ line, text }) => ({ file, line, text }));
}

function scan(find: (file: string, source: string) => GuardHit[]): GuardHit[] {
  return EDITOR_FILES.flatMap((file) => find(file, readSource(file)));
}

describe('editor guard detectors', () => {
  it('flags palette classes with variants, sides and opacity, not hs tokens or comments', () => {
    const source = [
      'const a = "hover:text-red-500 bg-hs-danger/10";',
      'const b = `border-t-amber-400/30 ${x}`;',
      '// bg-sky-500 in a comment is fine',
      'const c = "text-hs-warning-ink";',
    ].join('\n');
    expect(paletteHits('x.tsx', source).map((h) => `${h.line}: ${h.text}`)).toEqual(['1: text-red-500', '2: border-t-amber-400']);
  });

  it('flags a fixed full-screen layer in any class order, not one named in a comment', () => {
    const source = [
      '<div className="inset-0 fixed z-50" />',
      '<div className="absolute inset-0" />',
      '// a `fixed inset-0` modal, described',
      '<div className={`fixed inset-0 ${tone}`} />',
    ].join('\n');
    expect(fullScreenLayerHits('x.tsx', source).map((h) => h.line)).toEqual([1, 4]);
  });

  it('flags a switch role written as an attribute or a prop', () => {
    const source = ['<button role="switch" />', "const p = { role: 'switch' };", '<div role="group" />'].join('\n');
    expect(switchHits('x.tsx', source).map((h) => h.line)).toEqual([1, 2]);
  });
});

describe('editor colours', () => {
  /** Places that must not follow the theme. */
  const ALLOWED: GuardAllowance[] = [
    { file: 'src/components/editor/UpgradeModal.tsx', match: 'neutral-', reason: 'the update console is a terminal, dark in both themes' },
    { file: 'src/components/editor/EditorCanvas.tsx', match: 'bg-pink-500', reason: 'snap guides stay one loud colour over any screen design' },
  ];
  const hits = scan(paletteHits);

  it('uses hs-* theme tokens, not Tailwind palette colours', () => {
    const { offenders } = applyAllowances(hits, ALLOWED);
    expect(offenders, `Use an hs-* token (text-hs-danger, bg-hs-warning/10, border-hs-success/30, text-hs-warning-ink...), or Notice / StatusPill / StatusDot for a coloured box, pill or dot:\n${describeHits(offenders)}`).toEqual([]);
  });

  it('lists only exceptions that still apply', () => {
    expect(applyAllowances(hits, ALLOWED).stale).toEqual([]);
  });
});

describe('editor windows', () => {
  /** The two shells, and popovers that put a click-away layer behind themselves. */
  const ALLOWED: GuardAllowance[] = [
    { file: 'src/components/ui/ModalFrame.tsx', reason: 'is the window shell' },
    { file: 'src/components/ui/ConfirmModal.tsx', reason: 'is the question shell' },
    { file: 'src/components/editor/timetable-modal/CellDetails.tsx', reason: "the click-away layer behind a cell's popover" },
    { file: 'src/components/editor/timetable-modal/SourcePanel.tsx', reason: 'the click-away layer behind the source menu' },
  ];
  const hits = scan(fullScreenLayerHits);

  it('a full-screen layer is a ModalFrame or a ConfirmModal', () => {
    const { offenders } = applyAllowances(hits, ALLOWED);
    expect(offenders, `Open a window with <ModalFrame> (and ModalPanel / ModalHeader / ModalBody / ModalFooter), or ask with useConfirmStore().confirm, instead of a hand-made \`fixed inset-0\` layer:\n${describeHits(offenders)}`).toEqual([]);
  });

  it('lists only exceptions that still apply', () => {
    expect(applyAllowances(hits, ALLOWED).stale).toEqual([]);
  });
});

describe('editor switches', () => {
  const ALLOWED: GuardAllowance[] = [{ file: 'src/components/ui/Toggle.tsx', reason: 'is the switch' }];
  const hits = scan(switchHits);

  it('an on/off control is a Toggle or a Switch', () => {
    const { offenders } = applyAllowances(hits, ALLOWED);
    expect(offenders, `Use <Toggle> (with \`description\` for its help line) or <Switch> from ui/Toggle instead of a hand-built role="switch":\n${describeHits(offenders)}`).toEqual([]);
  });

  it('lists only exceptions that still apply', () => {
    expect(applyAllowances(hits, ALLOWED).stale).toEqual([]);
  });
});
