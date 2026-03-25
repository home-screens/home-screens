import { Header } from '@/components/Header';
import { Hero } from '@/components/Hero';
import { FeaturesBento } from '@/components/FeaturesBento';
import { ModuleShowcase } from '@/components/ModuleShowcase';
import { EditorExperience } from '@/components/EditorExperience';
import { TemplatesGallery } from '@/components/TemplatesGallery';
import { HowItWorks } from '@/components/HowItWorks';
import { OpenSourceCTA } from '@/components/OpenSourceCTA';
import { Footer } from '@/components/Footer';

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
