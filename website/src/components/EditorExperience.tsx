import { MousePointerClick, Eye, Settings } from 'lucide-react';
import { Container } from '@/components/Container';
import { SectionHeader } from '@/components/SectionHeader';
import { Reveal } from '@/components/Reveal';
import shots from '../../public/images/docs/manifest.json';

// A render from `npm run docs:shots` in the main repo, so the marketing page
// shows the editor as it is today rather than a screenshot from April.
const EDITOR = shots['editor-marketing'];

const callouts = [
  {
    icon: MousePointerClick,
    title: 'Drag to arrange',
    description: 'Place modules anywhere on a freeform canvas. Pixel-perfect control.',
  },
  {
    icon: Eye,
    title: 'Live preview',
    description: 'See changes in real time. What you build is what gets displayed.',
  },
  {
    icon: Settings,
    title: 'Configure everything',
    description: 'Every module has deep settings. No code required.',
  },
];

export function EditorExperience() {
  return (
    <section className="py-24">
      <Container>
        <Reveal
          y={0}
          margin="-80px"
          className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-16"
        >
          {/* Left: text + callouts */}
          <div>
            <SectionHeader
              title="A real editor, not a config file"
              description={
                <>
                  Build your display visually. The editor runs in your browser, talks to
                  the Pi over your local network.
                </>
              }
              descriptionClassName="mt-4 text-neutral-400"
            />

            <div className="mt-10 space-y-6">
              {callouts.map(({ icon: Icon, title, description }) => (
                <div key={title} className="flex gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#222] bg-[#161616]">
                    <Icon className="h-5 w-5 text-cyan-400/70" />
                  </div>
                  <div>
                    <p className="font-semibold text-white">{title}</p>
                    <p className="mt-1 text-sm text-neutral-500">{description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: editor screenshot */}
          <div className="overflow-hidden rounded-2xl border border-[#222] bg-[#111]">
            <picture>
              <source srcSet="/images/docs/editor-marketing.webp" type="image/webp" />
              <img
                src="/images/docs/editor-marketing.jpg"
                alt={EDITOR.alt}
                width={EDITOR.width}
                height={EDITOR.height}
                className="w-full"
              />
            </picture>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
