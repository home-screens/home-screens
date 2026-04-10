import type { Metadata } from 'next';
import { Inter, DM_Serif_Display } from 'next/font/google';
import PluginGlobals from '@/components/PluginGlobals';
import ThemeListener from '@/components/ThemeListener';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});
const dmSerif = DM_Serif_Display({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-dm-serif',
  display: 'swap',
});

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
      <body className={`${inter.variable} ${dmSerif.variable} antialiased`}>
        <ThemeListener />
        <PluginGlobals />
        {children}
      </body>
    </html>
  );
}
