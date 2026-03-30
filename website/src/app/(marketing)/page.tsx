import type { Metadata } from 'next';
import { Header } from '@/components/Header';
import { Hero } from '@/components/Hero';
import { FeaturesBento } from '@/components/FeaturesBento';
import { ModuleShowcase } from '@/components/ModuleShowcase';
import { EditorExperience } from '@/components/EditorExperience';
import { TemplatesGallery } from '@/components/TemplatesGallery';
import { HowItWorks } from '@/components/HowItWorks';
import { OpenSourceCTA } from '@/components/OpenSourceCTA';
import { Footer } from '@/components/Footer';

export const metadata: Metadata = {
  openGraph: {
    title: 'Home Screens — Smart Display for Your Home',
    description:
      'An open-source smart display system for Raspberry Pi. 36 built-in modules, drag-and-drop editor, plugin system. Free forever.',
    url: 'https://homescreens.dev',
  },
  twitter: {
    title: 'Home Screens — Smart Display for Your Home',
    description:
      'An open-source smart display for Raspberry Pi. 36 modules, drag-and-drop editor, plugin system. Free, self-hosted alternative to MagicMirror and Dakboard.',
  },
  alternates: {
    canonical: 'https://homescreens.dev',
  },
};

export default function Home() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <FeaturesBento />
        <ModuleShowcase />
        <EditorExperience />
        <TemplatesGallery />
        <HowItWorks />
        <OpenSourceCTA />
      </main>
      <Footer />
    </>
  );
}
