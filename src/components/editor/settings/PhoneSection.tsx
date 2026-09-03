'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Info, ListChecks, Printer, Smartphone } from 'lucide-react';
import { useTranslate } from '@/i18n';
import { useEditorStore } from '@/stores/editor-store';
import { useOrigin } from '@/hooks/useOrigin';
import { editorFetch } from '@/lib/editor-fetch';
import { logger } from '@/lib/logger';
import { UI_MONO_STACK } from '@/lib/font-registry';
import { resolveChoreModuleConfig } from '@/lib/chore-module-config';
import { settingsHref } from '@/lib/settings-route';
import { phoneSurfaceLabel, phoneSurfaceUrl, type PhoneSurface } from '@/lib/phone-surfaces';
import Button from '@/components/ui/Button';
import PhoneSurfaceQrCode from '@/components/editor/PhoneSurfaceQrCode';
import PasswordModal from '@/components/editor/settings/SecuritySection/PasswordModal';
import { CopyLinkButton } from '@/components/editor/PhoneSurfaceLinks';

const log = logger('phone-settings');

/**
 * Defaults › On your phone.
 *
 * States the difference between the two phone surfaces once, in the product,
 * instead of leaving people to infer it from a URL. Named for what it is rather
 * than for either route: it covers `/chores` and `/remote`, and "remote" is a
 * word nobody searches for.
 */
export default function PhoneSection() {
  const t = useTranslate('editor');
  const router = useRouter();
  const origin = useOrigin();
  const config = useEditorStore((s) => s.config);
  const [authEnabled, setAuthEnabled] = useState<boolean | null>(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  // Same helper /chores and /remote resolve their own chore config with, so
  // this page cannot disagree with the surface about whether it has anything
  // to show.
  const hasChoreChart = config ? resolveChoreModuleConfig(config) !== null : false;

  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await editorFetch('/api/auth/status');
        if (res.ok) setAuthEnabled((await res.json()).authEnabled === true);
      } catch (err) {
        log.debug('Failed to check auth status:', err);
      }
    }
    checkAuth();
  }, []);

  return (
    <>
      <div className="rounded-lg border border-hs-border bg-hs-panel p-3.5">
        <SurfaceRow
          surface="chores"
          origin={origin}
          // The kids' page falls back to ChoresEmptyState until a chore module
          // exists somewhere, so its card greys out rather than disappearing.
          // Hiding it would recreate the discoverability problem this page is
          // here to fix.
          disabled={!hasChoreChart}
          disabledNote={t('settings.phonePage.chores.needsChoreChart')}
        />
        <SurfaceRow surface="remote" origin={origin} />

        <div className="mt-1 flex items-center justify-between gap-4 border-t border-hs-border pt-3">
          <div>
            <div className="text-[12.5px] text-hs-text-body">{t('settings.phonePage.password.label')}</div>
            <div className="mt-0.5 text-[11px] text-hs-text-faint">
              {authEnabled === null
                ? t('settings.phonePage.password.checking')
                : authEnabled
                  ? t('settings.phonePage.password.on')
                  : t('settings.phonePage.password.off')}
            </div>
          </div>
          {/* Set up opens the dialog here rather than navigating to Security,
              whose copy is about the editor and API endpoints and never
              mentions the remote, so the destination read as the wrong page.
              Managing an existing password still goes to Security, which is
              where the rest of those controls live. */}
          <Button
            size="sm"
            onClick={() => {
              if (authEnabled) {
                router.push(
                  settingsHref({ kind: 'defaults', page: 'security' }, { from: window.location.search }),
                );
              } else {
                setShowPasswordModal(true);
              }
            }}
          >
            {authEnabled ? t('settings.phonePage.password.manageAction') : t('settings.phonePage.password.setUpAction')}
          </Button>
        </div>

        <div className="mt-3 flex items-center justify-between gap-4 border-t border-hs-border pt-3">
          <div>
            <div className="text-[12.5px] text-hs-text-body">{t('settings.phonePage.print.label')}</div>
            <div className="mt-0.5 text-[11px] text-hs-text-faint">{t('settings.phonePage.print.description')}</div>
          </div>
          <Button size="sm" disabled={!origin} onClick={() => window.print()}>
            <Printer className="mr-1.5 inline h-3 w-3" aria-hidden="true" />
            {t('settings.phonePage.print.action')}
          </Button>
        </div>
      </div>

      <PrintableCodes origin={origin} includeChores={hasChoreChart} />

      {showPasswordModal && (
        <PasswordModal
          mode="set"
          onClose={() => setShowPasswordModal(false)}
          onStatusChange={(status) => {
            setAuthEnabled(status.authEnabled);
            setShowPasswordModal(false);
          }}
          onDisplayTokenChange={() => {}}
        />
      )}
    </>
  );
}

function SurfaceRow({
  surface,
  origin,
  disabled = false,
  disabledNote,
}: {
  surface: PhoneSurface;
  origin: string;
  disabled?: boolean;
  disabledNote?: string;
}) {
  const t = useTranslate('editor');
  const isKid = surface === 'chores';
  const Icon = isKid ? ListChecks : Smartphone;

  return (
    <div
      data-testid={`phone-surface-${surface}`}
      className={`mb-2.5 flex gap-3.5 rounded-lg border p-3.5 ${
        disabled
          ? 'border-hs-border bg-hs-card opacity-60'
          : isKid
            ? 'border-hs-kid-ring bg-hs-kid-soft'
            : 'border-hs-border bg-hs-card'
      }`}
    >
      {disabled ? (
        <div
          className="flex h-[116px] w-[116px] shrink-0 items-center justify-center rounded-md border border-dashed border-hs-border-strong text-hs-text-faint"
          aria-hidden="true"
        >
          <Icon className="h-6 w-6" />
        </div>
      ) : (
        <PhoneSurfaceQrCode surface={surface} origin={origin} size={104} />
      )}

      <div className="min-w-0 flex-1">
        <p className="mb-0.5 flex items-center gap-2 text-[13.5px] font-semibold text-hs-text-primary">
          <Icon
            className={`h-4 w-4 ${disabled ? 'text-hs-text-muted' : isKid ? 'text-hs-kid' : 'text-hs-accent-hover'}`}
            aria-hidden="true"
          />
          {t(`settings.phonePage.${surface}.heading`)}
        </p>
        <p
          className={`mb-1.5 font-mono text-[11.5px] ${
            disabled ? 'text-hs-text-muted' : isKid ? 'text-hs-kid' : 'text-hs-accent-hover'
          }`}
        >
          {phoneSurfaceLabel(surface, origin)}
        </p>
        <p className="mb-2 text-[11.5px] leading-relaxed text-hs-text-muted">
          {t(`phoneSurfaces.surfaces.${surface}.description`)}
        </p>

        {disabled ? (
          <p className="flex items-center gap-1.5 text-[11.5px] text-hs-text-faint">
            <Info className="h-3 w-3 shrink-0" aria-hidden="true" />
            {disabledNote}
          </p>
        ) : (
          <div className="flex gap-1.5">
            <CopyLinkButton surface={surface} origin={origin} />
            <a
              href={phoneSurfaceUrl(surface, origin)}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border border-hs-border-strong bg-hs-card px-2 py-1 text-xs text-hs-text-body transition-colors hover:bg-hs-hover"
            >
              {t('settings.phonePage.open')}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Print-only sheet of the codes, for sticking on the fridge next to the
 * display. Hidden on screen and the only thing on the page when printing —
 * `window.print()` on the settings page itself would spool the sidebar, the
 * editor chrome, and two dark backgrounds.
 */
function PrintableCodes({ origin, includeChores }: { origin: string; includeChores: boolean }) {
  const t = useTranslate('editor');
  const surfaces: PhoneSurface[] = includeChores ? ['chores', 'remote'] : ['remote'];

  return (
    <div className="hs-print-only" aria-hidden="true">
      <style>{`
        .hs-print-only { display: none; }
        @media print {
          body * { visibility: hidden; }
          .hs-print-only, .hs-print-only * { visibility: visible; }
          .hs-print-only {
            display: block;
            position: absolute;
            inset: 0;
            padding: 32px;
            background: #fff;
            color: #000;
          }
        }
      `}</style>
      <h2 style={{ fontSize: 22, fontWeight: 600, marginBottom: 24 }}>
        {t('settings.phonePage.print.sheetTitle')}
      </h2>
      {surfaces.map((surface) => (
        <div key={surface} style={{ display: 'flex', gap: 24, alignItems: 'center', marginBottom: 32 }}>
          <PhoneSurfaceQrCode surface={surface} origin={origin} size={150} />
          <div>
            <p style={{ fontSize: 17, fontWeight: 600, margin: '0 0 4px' }}>
              {t(`settings.phonePage.${surface}.heading`)}
            </p>
            <p style={{ fontFamily: UI_MONO_STACK, fontSize: 14, margin: '0 0 6px' }}>
              {phoneSurfaceLabel(surface, origin)}
            </p>
            <p style={{ fontSize: 13, margin: 0, maxWidth: 380 }}>
              {t(`phoneSurfaces.surfaces.${surface}.description`)}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
