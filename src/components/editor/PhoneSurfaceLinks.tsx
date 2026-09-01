'use client';

import { useCallback, useState } from 'react';
import { ChevronRight, Copy, ListChecks, Check, Images, Smartphone, UtensilsCrossed } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslate } from '@/i18n';
import { useOrigin } from '@/hooks/useOrigin';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { copyText } from '@/lib/clipboard';
import {
  SURFACES_BY_CONTEXT,
  phoneSurfaceLabel,
  phoneSurfaceUrl,
  type PhoneContext,
  type PhoneSurface,
} from '@/lib/phone-surfaces';
import PhoneSurfaceQrCode from './PhoneSurfaceQrCode';

/** Icon per context+surface pairing, so the chip reads as its feature. */
const CHIP_ICONS: Record<PhoneContext, Partial<Record<PhoneSurface, LucideIcon>>> = {
  chores: { chores: ListChecks, remote: Smartphone },
  meals: { remote: UtensilsCrossed },
  photos: { remote: Images },
};

interface PhoneSurfaceLinksProps {
  context: PhoneContext;
}

/**
 * The editor's pointer at the phone surfaces, for the module config sections
 * that manage data a phone can edit.
 *
 * Replaces the grey unclickable `${origin}/remote` strings these sections used
 * to end on. Those were the highest-intent moment in the product — someone has
 * just added a chore chart and is looking for where chores get typed in — and
 * they were both unclickable and, for chores, pointed at the wrong surface.
 */
export default function PhoneSurfaceLinks({ context }: PhoneSurfaceLinksProps) {
  const t = useTranslate('editor');
  const origin = useOrigin();
  const [open, setOpen] = useState(false);
  const surfaces = SURFACES_BY_CONTEXT[context];

  return (
    <>
      <div className="mt-2.5 space-y-1.5">
        {surfaces.map((surface) => {
          const Icon = CHIP_ICONS[context][surface] ?? Smartphone;
          return (
            <a
              key={surface}
              href={phoneSurfaceUrl(surface, origin)}
              target="_blank"
              rel="noopener noreferrer"
              // A plain left click opens the code — the useful thing on the
              // laptop you are editing from, since the destination is a phone.
              // Modified and middle clicks fall through to the href, so the
              // chip still behaves like the link it looks like.
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                e.preventDefault();
                setOpen(true);
              }}
              className={`flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors ${
                surface === 'chores'
                  ? 'border-hs-kid-ring bg-hs-kid-soft hover:bg-hs-kid-hover'
                  : 'border-hs-border-strong bg-hs-card hover:bg-hs-hover'
              }`}
            >
              <Icon
                className={`h-4 w-4 shrink-0 ${surface === 'chores' ? 'text-hs-kid' : 'text-hs-accent-hover'}`}
                aria-hidden="true"
              />
              <span className="min-w-0">
                <span className="block text-[11.5px] font-semibold leading-tight text-hs-text-body">
                  {t(`phoneSurfaces.chips.${context}.${surface}`)}
                </span>
                <span className="mt-px block truncate text-[10.5px] leading-tight text-hs-text-faint">
                  {surface === 'chores'
                    ? t('phoneSurfaces.chips.choresSubtitle')
                    : phoneSurfaceLabel(surface, origin)}
                </span>
              </span>
              <ChevronRight className="ml-auto h-3.5 w-3.5 shrink-0 text-hs-text-faint" aria-hidden="true" />
            </a>
          );
        })}
      </div>

      {open && <PhoneSurfaceDialog context={context} onClose={() => setOpen(false)} />}
    </>
  );
}

/**
 * The scan-it-with-your-phone dialog. A centered dialog rather than an anchored
 * popover on purpose: these chips live in the 250px property panel, which
 * scrolls its own overflow, so anything anchored to them gets clipped.
 */
function PhoneSurfaceDialog({ context, onClose }: { context: PhoneContext; onClose: () => void }) {
  const t = useTranslate('editor');
  const tCore = useTranslate('core');
  const origin = useOrigin();
  const trapRef = useFocusTrap<HTMLDivElement>();
  const surfaces = SURFACES_BY_CONTEXT[context];

  useEscapeKey(onClose);

  return (
    <div
      className="fixed inset-0 z-modal flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t(`phoneSurfaces.dialog.title.${context}`)}
    >
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      <div
        ref={trapRef}
        // Narrower when only one surface is on offer: a lone card stretched
        // across the two-card width reads as a layout bug, not a choice.
        className={`relative w-full rounded-xl border border-hs-border-strong bg-hs-panel p-4 ${
          surfaces.length > 1 ? 'max-w-md' : 'max-w-64'
        }`}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-hs-text-primary">
              {t(`phoneSurfaces.dialog.title.${context}`)}
            </h2>
            <p className="mt-0.5 text-xs text-hs-text-muted">{t('phoneSurfaces.dialog.lede')}</p>
          </div>
          <button
            onClick={onClose}
            aria-label={tCore('actions.close')}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-lg leading-none text-hs-text-muted transition-colors hover:bg-hs-card hover:text-hs-text-body"
          >
            &times;
          </button>
        </div>

        <div className={`grid gap-2.5 ${surfaces.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {surfaces.map((surface) => (
            <PhoneSurfaceDialogCard key={surface} surface={surface} origin={origin} />
          ))}
        </div>

        <p className="mt-3 border-t border-hs-border pt-2.5 text-[11px] text-hs-text-faint">
          {t('phoneSurfaces.dialog.passwordHint')}
        </p>
      </div>
    </div>
  );
}

function PhoneSurfaceDialogCard({ surface, origin }: { surface: PhoneSurface; origin: string }) {
  const t = useTranslate('editor');
  const isKid = surface === 'chores';

  return (
    <div
      className={`rounded-lg border p-2.5 text-center ${
        isKid ? 'border-hs-kid-ring bg-hs-kid-soft' : 'border-hs-border bg-hs-card'
      }`}
    >
      <p className="text-xs font-semibold text-hs-text-body">
        {t(`phoneSurfaces.surfaces.${surface}.name`)}
      </p>
      <p className="mb-2 text-[10px] text-hs-text-faint">
        {t(`phoneSurfaces.surfaces.${surface}.audience`)}
      </p>
      <div className="flex justify-center">
        <PhoneSurfaceQrCode surface={surface} origin={origin} size={112} />
      </div>
      <p className={`mt-2 font-mono text-[10px] ${isKid ? 'text-hs-kid' : 'text-hs-accent-hover'}`}>
        {phoneSurfaceLabel(surface, origin)}
      </p>
      <p className="mt-1.5 text-[10.5px] leading-snug text-hs-text-faint">
        {t(`phoneSurfaces.surfaces.${surface}.description`)}
      </p>
      <div className="mt-2 flex justify-center">
        <CopyLinkButton surface={surface} origin={origin} />
      </div>
    </div>
  );
}

/**
 * Copy button that only reports success when the copy actually landed — over
 * plain HTTP `navigator.clipboard` is absent and `copyText` falls back to a
 * hidden textarea, which can itself be refused.
 */
export function CopyLinkButton({ surface, origin }: { surface: PhoneSurface; origin: string }) {
  const t = useTranslate('editor');
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (await copyText(phoneSurfaceUrl(surface, origin))) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [surface, origin]);

  return (
    <button
      onClick={handleCopy}
      disabled={!origin}
      className="flex items-center gap-1.5 rounded-md border border-hs-border-strong bg-hs-card px-2 py-1 text-xs text-hs-text-body transition-colors hover:bg-hs-hover disabled:opacity-50"
    >
      {copied ? (
        <Check className="h-3 w-3 text-hs-success" aria-hidden="true" />
      ) : (
        <Copy className="h-3 w-3" aria-hidden="true" />
      )}
      {copied ? t('phoneSurfaces.dialog.copied') : t('phoneSurfaces.dialog.copyLink')}
    </button>
  );
}
