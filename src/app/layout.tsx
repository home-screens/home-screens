import type { Metadata } from 'next';
// Self-hosted from src/app/fonts, NOT next/font/google.
//
// next/font/google downloads every family from fonts.gstatic.com during the
// build. CI builds once per E2E shard, so that was dozens of requests to
// Google per run, and one 404 from their CDN failed the whole build with
// errors that read like a code defect (2026-08-14). The bytes served to the
// browser are identical — next/font/google was already self-hosting these in
// the build output — so this only changes where the files come from.
//
// Run `node scripts/fetch-fonts.mjs` to refresh or add a family.
import localFont from 'next/font/local';
import ThemeListener from '@/components/ThemeListener';
import { readConfig } from '@/lib/config';
import { DEFAULT_LOCALE } from '@/i18n/manifest';
import './globals.css';
// Self-hosted Font Awesome 7 free. Importing the package CSS lets Next process
// its `@font-face` URLs through the asset pipeline — the woff2 fonts are
// bundled, hashed, and served alongside the build output. No CDN, no postinstall
// copy step for the CSS/fonts (the slim search manifest still needs the postinstall).
import '@fortawesome/fontawesome-free/css/all.min.css';

// Variable families: one file spans the whole weight axis, so the range
// below must cover every weight the app actually uses.
const inter = localFont({
  src: './fonts/inter-variable.woff2',
  weight: '100 900',
  variable: '--font-inter',
  display: 'swap',
});
const roboto = localFont({
  src: './fonts/roboto-variable.woff2',
  weight: '100 900',
  variable: '--font-roboto',
  display: 'swap',
});
const playfair = localFont({
  src: './fonts/playfair-display-variable.woff2',
  weight: '400 900',
  variable: '--font-playfair',
  display: 'swap',
});
const lora = localFont({
  src: './fonts/lora-variable.woff2',
  weight: '400 700',
  variable: '--font-lora',
  display: 'swap',
});
const jetbrains = localFont({
  src: './fonts/jetbrains-mono-variable.woff2',
  weight: '100 800',
  variable: '--font-jetbrains',
  display: 'swap',
});
const caveat = localFont({
  src: './fonts/caveat-variable.woff2',
  weight: '400 700',
  variable: '--font-caveat',
  display: 'swap',
});

// Static families: a distinct file per weight.
const poppins = localFont({
  src: [
    { path: './fonts/poppins-400.woff2', weight: '400', style: 'normal' },
    { path: './fonts/poppins-600.woff2', weight: '600', style: 'normal' },
    { path: './fonts/poppins-700.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-poppins',
  display: 'swap',
});
const dmSerif = localFont({
  src: './fonts/dm-serif-display-400.woff2',
  weight: '400',
  variable: '--font-dm-serif',
  display: 'swap',
});
const bebas = localFont({
  src: './fonts/bebas-neue-400.woff2',
  weight: '400',
  variable: '--font-bebas',
  display: 'swap',
});
const pacifico = localFont({
  src: './fonts/pacifico-400.woff2',
  weight: '400',
  variable: '--font-pacifico',
  display: 'swap',
});

const FONT_VARIABLES = [
  inter.variable,
  roboto.variable,
  poppins.variable,
  playfair.variable,
  lora.variable,
  dmSerif.variable,
  jetbrains.variable,
  bebas.variable,
  caveat.variable,
  pacifico.variable,
].join(' ');

export const metadata: Metadata = {
  title: 'Home Screens',
  description: 'Smart home display system',
};

// The root `<html lang>` is driven by `settings.locale`, which is mutable
// at runtime. Opt out of static pre-rendering so a config change is
// reflected on the next request rather than after a redeploy.
export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Read the active locale so `<html lang>` matches the rendered UI.
  // Without this, browser-level locale features — hyphenation, spellcheck,
  // screen-reader pronunciation, `:lang()` CSS selectors, and the "translate
  // this page?" prompt — all behave as English even when the UI is
  // rendering Spanish/German/French. The per-route layouts also re-read
  // this value to wire `<I18nProvider locale>`, so the document and the
  // provider stay in lockstep.
  const config = await readConfig().catch(() => null);
  const locale = config?.settings?.locale ?? DEFAULT_LOCALE;

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){
      try {
        var p = location.pathname;
        var key = (p.indexOf('/remote') === 0 || p.indexOf('/chores') === 0) ? 'hs-theme-remote' : 'hs-theme';
        var stored = localStorage.getItem(key);
        var resolved;
        if (stored === 'light' || stored === 'dark') {
          resolved = stored;
        } else if (stored === 'system') {
          resolved = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
        } else {
          resolved = 'dark';
        }
        document.documentElement.setAttribute('data-theme', resolved);
      } catch (e) {
        document.documentElement.setAttribute('data-theme', 'dark');
      }
    })();`,
          }}
        />
      </head>
      <body className={`${FONT_VARIABLES} antialiased`}>
        <ThemeListener />
        {children}
      </body>
    </html>
  );
}
