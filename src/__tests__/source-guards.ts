import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import ts from 'typescript';

/**
 * What the UI drift guards share: walking source folders, reading code with
 * its comments left out, and pulling out the words a file puts on screen.
 * A guard reports `file:line` and names the shared piece to use instead; an
 * allowed exception names its file, optionally the text it allows, and why.
 */

/** One thing a guard found: where it is, and the text that matched. */
export interface GuardHit {
  file: string;
  line: number;
  text: string;
}

/** A real exception to a guard. `match` narrows it to hits whose text contains it; without it the whole file is allowed. */
export interface GuardAllowance {
  file: string;
  match?: string;
  reason: string;
}

const SOURCE = /\.(ts|tsx)$/;
const TEST_FILE = /\.test\.(ts|tsx)$/;

/**
 * Source files (not tests) under each root, as repo-relative paths. A root
 * may also be a single file. `include` narrows by file name.
 */
export function sourceFiles(roots: string[], include: RegExp = SOURCE): string[] {
  const repo = process.cwd();
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      if (name === '__tests__' || name === 'node_modules') return [];
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) return walk(full);
      return SOURCE.test(name) && !TEST_FILE.test(name) && include.test(name) ? [full] : [];
    });
  return roots
    .flatMap((root) => {
      const full = path.join(repo, root);
      return statSync(full).isDirectory() ? walk(full) : [full];
    })
    .map((full) => path.relative(repo, full))
    .sort();
}

export function readSource(file: string): string {
  return readFileSync(path.join(process.cwd(), file), 'utf8');
}

function parse(file: string, source: string): ts.SourceFile {
  return ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}

/** Start and end of every comment in a file, found as trivia between its tokens (so a `//` inside a string is not one). */
function commentRanges(sf: ts.SourceFile): Array<[number, number]> {
  const text = sf.getFullText();
  const ranges: Array<[number, number]> = [];
  const visit = (node: ts.Node) => {
    if (node.kind !== ts.SyntaxKind.JsxText) {
      for (const r of ts.getLeadingCommentRanges(text, node.pos) ?? []) ranges.push([r.pos, r.end]);
    }
    if (node.kind < ts.SyntaxKind.FirstNode) return;
    for (const child of node.getChildren(sf)) visit(child);
  };
  visit(sf);
  return ranges;
}

function lineAt(source: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) if (source.charCodeAt(i) === 10) line++;
  return line;
}

/**
 * Every match of `pattern` (which must be global) in a file's code, with its
 * comments left out. Files the pattern never matches are not parsed.
 */
export function codeMatches(file: string, source: string, pattern: RegExp): Array<GuardHit & { match: RegExpExecArray }> {
  const matches = [...source.matchAll(pattern)];
  if (matches.length === 0) return [];
  const comments = commentRanges(parse(file, source));
  return matches
    .filter((m) => !comments.some(([start, end]) => m.index >= start && m.index < end))
    .map((m) => ({ file, line: lineAt(source, m.index), text: m[0], match: m }));
}

/** One piece of words in a file: JSX text (entities decoded), or the contents of a string or template literal. */
export interface TextPiece {
  line: number;
  text: string;
  kind: 'jsx' | 'string' | 'template';
  /** For JSX text: whether a `{…}` sits right before or after it in the same element. */
  besideExpression: boolean;
}

const NAMED_ENTITIES: Record<string, string> = {
  times: '×', rsaquo: '›', lsaquo: '‹', hearts: '♥', check: '✓', mdash: '—', middot: '·',
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] !== '#') return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
    const hex = body[1] === 'x' || body[1] === 'X';
    return String.fromCodePoint(parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10));
  });
}

/**
 * The words a file puts on screen or sends: its JSX text and its string and
 * template literal contents, never its comments. `quick` is a cheap test on
 * the raw file; a file it does not match is not parsed.
 */
export function textPieces(file: string, source: string, quick: RegExp): TextPiece[] {
  if (!quick.test(source)) return [];
  const sf = parse(file, source);
  const pieces: TextPiece[] = [];
  const visit = (node: ts.Node) => {
    let piece: Omit<TextPiece, 'line'> | null = null;
    if (ts.isJsxText(node)) {
      const siblings = node.parent && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent)) ? [...node.parent.children] : [];
      const at = siblings.indexOf(node);
      const isExpression = (n: ts.Node | undefined) => !!n && ts.isJsxExpression(n) && !!n.expression;
      piece = { text: decodeEntities(node.getText(sf)), kind: 'jsx', besideExpression: isExpression(siblings[at - 1]) || isExpression(siblings[at + 1]) };
    } else if (ts.isStringLiteral(node)) {
      piece = { text: node.text, kind: 'string', besideExpression: false };
    } else if (ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      piece = { text: node.text, kind: 'template', besideExpression: !ts.isNoSubstitutionTemplateLiteral(node) };
    }
    if (piece) pieces.push({ ...piece, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1 });
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return pieces;
}

/**
 * Splits hits into the ones that need fixing and the allowances that no
 * longer allow anything (so a fixed exception leaves the list too).
 */
export function applyAllowances(hits: GuardHit[], allowances: GuardAllowance[]): { offenders: GuardHit[]; stale: GuardAllowance[] } {
  const covers = (a: GuardAllowance, h: GuardHit) => a.file === h.file && (a.match === undefined || h.text.includes(a.match));
  return {
    offenders: hits.filter((h) => !allowances.some((a) => covers(a, h))),
    stale: allowances.filter((a) => !hits.some((h) => covers(a, h))),
  };
}

/** `file:line: text`, one per line, for a failure message. */
export function describeHits(hits: GuardHit[]): string {
  return hits.map((h) => `${h.file}:${h.line}: ${h.text}`).join('\n');
}
