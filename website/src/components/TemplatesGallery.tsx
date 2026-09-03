import { Container } from '@/components/Container';
import { SectionHeader } from '@/components/SectionHeader';
import { Reveal } from '@/components/Reveal';
import type { GalleryTemplate } from '@/lib/templates';

export function TemplatesGallery({
  templates,
}: {
  // Read from the shipped layout files at build time; see @/lib/templates.
  templates: GalleryTemplate[];
}) {
  if (templates.length === 0) return null;

  return (
    <section id="templates" className="py-24">
      <Container>
        <div className="mb-10">
          <SectionHeader
            title="Start from a template"
            description="Pre-built layouts for common setups. Customize from there."
          />
        </div>
      </Container>

      <Reveal y={0} margin="-60px" className="flex gap-4 overflow-x-auto px-4 pb-4 sm:px-6 lg:px-8 snap-x">
        {templates.map((t) => (
          <div
            key={t.id}
            className="w-72 shrink-0 snap-start rounded-2xl border border-[#222] bg-[#161616] p-5 transition-colors hover:border-cyan-500/30"
          >
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="font-semibold text-white">{t.name}</h3>
              <span className="shrink-0 font-mono text-xs text-cyan-300">
                {t.moduleCount} {t.moduleCount === 1 ? 'module' : 'modules'}
              </span>
            </div>
            <p className="mt-2 text-sm text-neutral-500">{t.description}</p>
          </div>
        ))}
      </Reveal>
    </section>
  );
}
