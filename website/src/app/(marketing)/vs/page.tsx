import type { Metadata } from 'next';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { VsComparison } from '@/components/VsComparison';

export const metadata: Metadata = {
  title: {
    absolute:
      'MagicMirror vs Dakboard (2026): Honest Comparison + Free Alternative',
  },
  description:
    'Compare MagicMirror (free, DIY) and Dakboard ($6/mo for 2 screens, cloud) on price, features, and setup. Plus a self-hosted middle path with a visual editor and no subscription.',
  alternates: {
    canonical: 'https://homescreens.dev/vs',
  },
  openGraph: {
    title: 'MagicMirror vs Dakboard (2026): Honest Comparison',
    description:
      'MagicMirror is free but DIY. Dakboard is polished but cloud + subscription. Home Screens is the middle path — open source, visual editor, self-hosted on your Pi.',
    url: 'https://homescreens.dev/vs',
    type: 'article',
  },
  twitter: {
    title: 'MagicMirror vs Dakboard (2026): Honest Comparison',
    description:
      'Free DIY vs $6/mo cloud (2 screens) — full side-by-side on price, features, and setup, plus a self-hosted alternative with a visual editor.',
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
