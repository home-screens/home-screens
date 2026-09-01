'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Monitor } from 'lucide-react';
import HomeScreensLogo from '@/components/brand/HomeScreensLogo';
import PhoneHandoff, { HandoffLink } from '@/components/PhoneHandoff';
import { MIN_EDITOR_WIDTH } from '@/lib/constants';
import { useTranslate } from '@/i18n';

/**
 * What `/` shows. A laptop goes to the editor, as it always has; a phone
 * gets a launcher instead of the editor's "needs a wider screen" dead end,
 * because most people open the hub for the first time from the phone they
 * read the install guide on, and the surfaces built for a phone (`/remote`,
 * `/chores`) were otherwise undiscoverable from here.
 *
 * The launcher is server-rendered so a no-JS fetch (curl, a link preview)
 * sees real content; it is hidden by CSS above the editor's minimum width so
 * a wide window never flashes it, and the effect sends wide windows on to
 * the editor. A wide window with scripts off gets a plain link instead.
 */
export default function RootLauncher({ showChores }: { showChores: boolean }) {
  const router = useRouter();
  const t = useTranslate('core');

  useEffect(() => {
    if (window.innerWidth >= MIN_EDITOR_WIDTH) router.replace('/editor');
  }, [router]);

  return (
    <main className="min-h-screen bg-hs-body text-hs-text-primary flex flex-col items-center px-5 py-10">
      <HomeScreensLogo className="mb-8" />
      <div className="md:hidden w-full flex flex-col items-center" data-testid="root-launcher">
        <h1 className="text-lg font-semibold mb-5">{t('launcher.heading')}</h1>
        <nav className="w-full flex justify-center" aria-label={t('launcher.heading')}>
          <PhoneHandoff showChores={showChores}>
            <HandoffLink href="/display" icon={<Monitor className="w-5 h-5" />} title={t('launcher.display.title')} body={t('launcher.display.body')} />
          </PhoneHandoff>
        </nav>
      </div>
      <noscript>
        <a href="/editor" className="hidden md:block text-sm text-hs-accent hover:underline">
          {t('launcher.openEditor')}
        </a>
      </noscript>
    </main>
  );
}
