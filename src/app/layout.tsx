import type { Metadata } from 'next';
import {
  Inter,
  Roboto,
  Poppins,
  Playfair_Display,
  Lora,
  DM_Serif_Display,
  JetBrains_Mono,
  Bebas_Neue,
  Caveat,
  Pacifico,
} from 'next/font/google';
import ThemeListener from '@/components/ThemeListener';
import { readConfig } from '@/lib/config';
import { DEFAULT_LOCALE } from '@/i18n/manifest';
import './globals.css';
// Self-hosted Font Awesome 7 free. Importing the package CSS lets Next process
// its `@font-face` URLs through the asset pipeline — the woff2 fonts are
// bundled, hashed, and served alongside the build output. No CDN, no postinstall
// copy step for the CSS/fonts (the slim search manifest still needs the postinstall).
import '@fortawesome/fontawesome-free/css/all.min.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});
const roboto = Roboto({
  weight: ['400', '500', '700'],
  subsets: ['latin'],
  variable: '--font-roboto',
  display: 'swap',
});
const poppins = Poppins({
  weight: ['400', '600', '700'],
  subsets: ['latin'],
  variable: '--font-poppins',
  display: 'swap',
});
const playfair = Playfair_Display({
  weight: ['400', '700', '900'],
  subsets: ['latin'],
  variable: '--font-playfair',
  display: 'swap',
});
const lora = Lora({
  weight: ['400', '700'],
  subsets: ['latin'],
  variable: '--font-lora',
  display: 'swap',
});
const dmSerif = DM_Serif_Display({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-dm-serif',
  display: 'swap',
});
const jetbrains = JetBrains_Mono({
  weight: ['400', '700'],
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
});
const bebas = Bebas_Neue({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-bebas',
  display: 'swap',
});
const caveat = Caveat({
  weight: ['400', '700'],
  subsets: ['latin'],
  variable: '--font-caveat',
  display: 'swap',
});
const pacifico = Pacifico({
  weight: '400',
  subsets: ['latin'],
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
