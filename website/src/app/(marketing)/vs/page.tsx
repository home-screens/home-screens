import type { Metadata } from 'next';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { VsComparison } from '@/components/VsComparison';

export const metadata: Metadata = {
  title: {
    absolute:
      'Home Screens vs MagicMirror vs Dakboard — Smart Display Comparison',
  },
  description:
    'An honest side-by-side of the three main smart display options for Raspberry Pi: MagicMirror (open, DIY), Dakboard (polished, cloud), and Home Screens (open + visual editor, self-hosted).',
  alternates: {
    canonical: 'https://homescreens.dev/vs',
  },
  openGraph: {
    title: 'Home Screens vs MagicMirror vs Dakboard',
    description:
      'MagicMirror is free but DIY. Dakboard is polished but cloud + subscription. Home Screens is the middle path — open source with a visual editor, self-hosted on your Pi.',
    url: 'https://homescreens.dev/vs',
    type: 'article',
  },
  twitter: {
    title: 'Home Screens vs MagicMirror vs Dakboard',
    description:
      'An honest comparison of the three main Raspberry Pi smart display options — price, features, hosting, and where each one genuinely wins.',
  },
};

export default function VsPage() {
  return (
    <>
      <Header />
      <main>
        <VsComparison />
      </main>
      <Footer />
    </>
  );
}
