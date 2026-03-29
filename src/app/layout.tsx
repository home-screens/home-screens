import type { Metadata } from 'next';
import { Inter, DM_Serif_Display } from 'next/font/google';
// Alternative font: softer geometry, pairs well with smart-home dashboard aesthetic.
// To test, uncomment Plus_Jakarta_Sans, swap `inter` for `jakarta` in <body>, and
// update --font-sans in globals.css to var(--font-jakarta).
// import { Plus_Jakarta_Sans } from 'next/font/google';
import PluginGlobals from '@/components/PluginGlobals';
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
// const jakarta = Plus_Jakarta_Sans({
//   subsets: ['latin'],
//   variable: '--font-jakarta',
// });

export const metadata: Metadata = {
  title: 'Home Screens',
  description: 'Smart home display system',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${dmSerif.variable} antialiased`}>
        <PluginGlobals />
        {children}
      </body>
    </html>
  );
}
