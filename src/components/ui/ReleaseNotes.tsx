'use client';

import { useMemo } from 'react';
import { parseReleaseNotes, type InlineNode, type ReleaseNoteBlock } from '@/lib/release-notes';

interface Props {
  /** Raw Markdown release body, as GitHub returns it. */
  markdown: string;
  /** Rendered when the body is empty or whitespace only. */
  emptyLabel: string;
}

function Inline({ nodes }: { nodes: InlineNode[] }) {
  return (
    <>
      {nodes.map((node, i) => {
        switch (node.type) {
          case 'strong':
            return <strong key={i} className="font-semibold text-hs-text-primary">{node.value}</strong>;
          case 'em':
            return <em key={i}>{node.value}</em>;
          case 'code':
            return (
              <code key={i} className="rounded bg-hs-card px-1 py-0.5 font-mono text-[0.85em] text-hs-text-body">
                {node.value}
              </code>
            );
          case 'link':
            return (
              <a
                key={i}
                href={node.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-hs-accent underline underline-offset-2 hover:text-hs-accent-hover break-words"
              >
                {node.value}
              </a>
            );
          default:
            return <span key={i}>{node.value}</span>;
        }
      })}
    </>
  );
}

function Block({ block }: { block: ReleaseNoteBlock }) {
  switch (block.type) {
    case 'heading':
      return (
        <h4
          className={`font-semibold text-hs-text-primary ${block.level <= 2 ? 'text-sm uppercase tracking-wider' : 'text-sm'} mt-5 first:mt-0`}
        >
          <Inline nodes={block.content} />
        </h4>
      );
    case 'list':
      return (
        <ul className="space-y-2 pl-1">
          {block.items.map((item, i) => (
            <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-hs-text-muted">
              <span aria-hidden className="mt-[0.55em] h-1 w-1 shrink-0 rounded-full bg-hs-text-faint" />
              <span className="min-w-0"><Inline nodes={item} /></span>
            </li>
          ))}
        </ul>
      );
    case 'code':
      return (
        <pre className="overflow-x-auto rounded-md border border-hs-border bg-hs-card p-3 font-mono text-xs text-hs-text-body">
          {block.value}
        </pre>
      );
    default:
      return (
        <p className="text-sm leading-relaxed text-hs-text-muted">
          <Inline nodes={block.content} />
        </p>
      );
  }
}

/**
 * Renders a GitHub release body. Parsed into a block tree rather than injected
 * as HTML, so a release note can never smuggle markup into the editor.
 */
export default function ReleaseNotes({ markdown, emptyLabel }: Props) {
  const blocks = useMemo(() => parseReleaseNotes(markdown), [markdown]);

  if (blocks.length === 0) {
    return <p className="text-sm text-hs-text-faint">{emptyLabel}</p>;
  }

  return (
    <div className="space-y-3">
      {blocks.map((block, i) => (
        <Block key={i} block={block} />
      ))}
    </div>
  );
}
