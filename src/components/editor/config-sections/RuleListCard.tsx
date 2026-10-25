'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronRight, Pencil } from 'lucide-react';
import { useTranslate } from '@/i18n';

/**
 * The card chrome every rules list shares (calendar Event looks and Day
 * looks, Text looks): a header with the rule's name, an inline rename, move
 * up/down and remove, and a body that opens on click. Strings live under
 * `configSections.ruleList`. The fields inside are the caller's.
 */

const KEY = 'configSections.ruleList';

export function newRuleId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `rule-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function moveRule<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function replaceRuleAt<T>(list: T[], index: number, item: T): T[] {
  return list.map((existing, i) => (i === index ? item : existing));
}

/** Collapses a name to the form used for the uniqueness check: trimmed,
 *  internal runs of whitespace collapsed to one space, lowercased. */
export function normalizeRuleName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Names another rule in the list already carries, for the uniqueness check —
 *  normalized (see `normalizeRuleName`) and without the rule being edited
 *  itself. An unnamed rule falls back to its displayed "Rule N" label so a
 *  typed name can't collide with it either. */
export function otherRuleNames<T extends { name?: string }>(
  rules: T[],
  selfIndex: number,
  fallbackTitle: (n: number) => string,
): string[] {
  return rules
    .map((r, j) => (j === selfIndex ? null : normalizeRuleName(r.name?.trim() || fallbackTitle(j + 1))))
    .filter((n): n is string => n != null);
}

/**
 * Which rules are open. Rules collapse one at a time so a list reads as a
 * list, not a wall of forms; a freshly added rule opens expanded so it can be
 * filled in right away. In-memory only — nothing about expansion is saved.
 */
export function useExpandedRules() {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const toggle = (id: string) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const expand = (id: string) => setExpanded((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  return { expanded, toggle, expand };
}

export function RuleGroupLabel({ children }: { children: ReactNode }) {
  return <span className="text-[10px] font-semibold uppercase tracking-wider text-hs-text-faint">{children}</span>;
}

/** Inline name editor opened by the card's pencil. Commits a trimmed name
 *  (or clears it when empty) on Enter / blur; Escape cancels. A name another
 *  rule in the same list already carries (ignoring case and spacing) is
 *  refused — the editor stays open and says so, nothing is written. */
function RuleNameEditor({ initial, otherNames, onCommit, onCancel }: {
  initial: string;
  /** Normalized (see `normalizeRuleName`) names of the other rules in this list. */
  otherNames: string[];
  onCommit: (name: string | undefined) => void;
  onCancel: () => void;
}) {
  const t = useTranslate('editor');
  const [draft, setDraft] = useState(initial);
  const [taken, setTaken] = useState(false);
  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && otherNames.includes(normalizeRuleName(trimmed))) {
      setTaken(true);
      return;
    }
    onCommit(trimmed || undefined);
  };
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-0.5" data-rule-name-editor="">
      <input
        autoFocus
        value={draft}
        onChange={(e) => { setDraft(e.target.value); setTaken(false); }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
          if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
        }}
        placeholder={t(`${KEY}.ruleNamePlaceholder`)}
        className="w-full rounded border border-hs-accent bg-hs-input px-1.5 py-0.5 text-xs font-semibold text-hs-text-body outline-none"
      />
      {taken && (
        <span className="text-[10px] text-hs-warning" data-rule-name-taken="">
          {t(`${KEY}.ruleNameTaken`)}
        </span>
      )}
    </div>
  );
}

export function RuleCard({
  index, total, name, defaultName, expanded, onToggle, onRename, otherNames, onMove, onRemove, summary, trailing, children,
}: {
  index: number;
  total: number;
  name: string | undefined;
  /** The title of an unnamed card; "Rule {n}" unless the list calls its rows something else. */
  defaultName?: string;
  expanded: boolean;
  onToggle: () => void;
  onRename: (name: string | undefined) => void;
  /** Normalized (see `normalizeRuleName`) names of the other rules in this list. */
  otherNames: string[];
  onMove: (to: number) => void;
  onRemove: () => void;
  /** Muted text after the name: what the rule does, in a few words. */
  summary?: ReactNode;
  /** Right of the summary, before the buttons: swatches, a status pill. */
  trailing?: ReactNode;
  children: ReactNode;
}) {
  const t = useTranslate('editor');
  const [editing, setEditing] = useState(false);
  return (
    <div className="flex flex-col gap-2 rounded-md border border-hs-border-strong bg-hs-card p-2.5" data-rule-card="">
      <div className="flex items-center justify-between gap-1">
        {editing ? (
          <RuleNameEditor
            initial={name ?? ''}
            otherNames={otherNames}
            onCommit={(next) => { setEditing(false); onRename(next); }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <button
            type="button"
            data-rule-toggle=""
            aria-expanded={expanded}
            onClick={onToggle}
            className="flex min-w-0 flex-1 items-center gap-1 text-left"
          >
            <ChevronRight className={`h-3 w-3 flex-none text-hs-text-faint transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`} aria-hidden="true" />
            <span className={`truncate text-xs font-semibold ${name ? 'text-hs-text-body' : 'text-hs-text-muted'}`} data-rule-name="">
              {name ?? defaultName ?? t(`${KEY}.ruleTitle`, { n: index + 1 })}
            </span>
          </button>
        )}
        <div className="flex flex-none items-center gap-1">
          {!editing && (
            <button type="button" aria-label={t(`${KEY}.renameRule`)} title={t(`${KEY}.renameRule`)} onClick={() => setEditing(true)} className="px-1 text-xs text-hs-text-muted hover:text-hs-text-body">
              <Pencil className="h-3 w-3" aria-hidden="true" />
            </button>
          )}
          <button type="button" aria-label={t(`${KEY}.moveUp`)} title={t(`${KEY}.moveUp`)} disabled={index === 0} onClick={() => onMove(index - 1)} className="px-1 text-xs text-hs-text-muted hover:text-hs-text-body disabled:opacity-30">▲</button>
          <button type="button" aria-label={t(`${KEY}.moveDown`)} title={t(`${KEY}.moveDown`)} disabled={index === total - 1} onClick={() => onMove(index + 1)} className="px-1 text-xs text-hs-text-muted hover:text-hs-text-body disabled:opacity-30">▼</button>
          <button type="button" aria-label={t(`${KEY}.remove`)} title={t(`${KEY}.remove`)} onClick={onRemove} className="px-1 text-xs text-hs-text-muted hover:text-hs-danger">✕</button>
        </div>
      </div>
      {/* The panel is narrow, so what the rule does and whether it is in
          effect get their own line under the name instead of fighting the
          buttons for the first one. */}
      {(summary || trailing) && !editing && (
        <div className="flex items-center gap-1.5 pl-4">
          {summary && (
            <span className="min-w-0 flex-1 truncate text-[11px] text-hs-text-muted" data-rule-summary="">
              {summary}
            </span>
          )}
          {trailing}
        </div>
      )}
      {expanded && <div className="flex flex-col gap-2 border-t border-hs-border pt-2">{children}</div>}
    </div>
  );
}
