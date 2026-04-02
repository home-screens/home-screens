import type { Metadata } from 'next';
import { Inter, DM_Serif_Display } from 'next/font/google';
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
