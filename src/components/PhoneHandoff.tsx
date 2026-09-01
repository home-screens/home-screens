'use client';

import { Smartphone, ListChecks, PencilRuler } from 'lucide-react';
import EditorAddressCard from '@/components/EditorAddressCard';
import { useTranslate } from '@/i18n';

/**
 * The phone visitor's options, shared by the launcher at `/` and the
 * editor's too-narrow screen so the two never drift: the family remote,
 * the kids' chores page (only once a chore chart is on a screen — before
 * that it is an empty state a phone cannot act on), and the editor address
 * to carry to a laptop.
 */
export default function PhoneHandoff({ showChores, children }: { showChores: boolean; children?: React.ReactNode }) {
  const t = useTranslate('core');
  return (
    <div className="w-full max-w-sm flex flex-col gap-3">
      <HandoffLink href="/remote" icon={<Smartphone className="w-5 h-5" />} title={t('launcher.remote.title')} body={t('launcher.remote.body')} />
      {showChores && (
        <HandoffLink href="/chores" icon={<ListChecks className="w-5 h-5" />} title={t('launcher.chores.title')} body={t('launcher.chores.body')} />
      )}
      {children}
      <div className="rounded-xl border border-hs-border-strong bg-hs-panel p-4 text-left">
        <div className="flex items-center gap-3 mb-1">
          <span className="text-hs-text-muted"><PencilRuler className="w-5 h-5" /></span>
          <span className="text-sm font-medium">{t('launcher.editor.title')}</span>
        </div>
        <p className="text-xs text-hs-text-faint mb-3">{t('launcher.editor.body')}</p>
        <EditorAddressCard />
      </div>
    </div>
  );
}

export function HandoffLink({ href, icon, title, body }: { href: string; icon: React.ReactNode; title: string; body: string }) {
  return (
    <a
      href={href}
      className="flex items-center gap-3 rounded-xl border border-hs-border-strong bg-hs-panel p-4 text-left hover:bg-hs-hover transition-colors"
    >
      <span className="text-hs-accent">{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-hs-text-faint">{body}</span>
      </span>
    </a>
  );
}
