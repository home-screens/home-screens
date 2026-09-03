import { Github } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Container } from '@/components/Container';
import { DiscordIcon } from '@/components/DiscordIcon';
import { DISCORD_INVITE_URL } from '@/lib/site-navigation';
import { Reveal } from '@/components/Reveal';

export function OpenSourceCTA({ version }: { version: string }) {

  return (
    <section className="relative overflow-hidden py-24">
      {/* Cyan radial glow */}
      <div className="absolute top-1/2 left-1/2 -z-10 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-500/[0.04] blur-3xl" />

      <Container>
        <Reveal className="text-center" y={20} margin="-60px">
          <h2 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Free. Open Source. Forever.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-neutral-400">
            No subscriptions, no cloud lock-in, no personal data harvesting. Just a
            display that works for you.
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <Badge color="green">MIT License</Badge>
            <Badge color="cyan">
              <span className="font-mono">{version}</span>
            </Badge>
          </div>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Button href="https://github.com/home-screens/home-screens">
              <Github className="h-4 w-4" />
              View on GitHub
            </Button>
            <Button href={DISCORD_INVITE_URL} variant="outline">
              <DiscordIcon className="h-4 w-4" />
              Join us on Discord
            </Button>
            <Button href="/docs" variant="outline">
              Read the Docs
            </Button>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
