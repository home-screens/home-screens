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
import PluginGlobals from '@/components/PluginGlobals';
import ThemeListener from '@/components/ThemeListener';
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
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
        <PluginGlobals />
        {children}
      </body>
    </html>
  );
}
