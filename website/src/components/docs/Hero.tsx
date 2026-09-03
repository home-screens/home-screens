import Image from 'next/image'

import { Button } from '@/components/docs/Button'
import { HeroBackground } from '@/components/docs/HeroBackground'
import { MODULE_COUNT, WEATHER_PROVIDER_COUNT } from '@/lib/stats'
import blurCyanImage from '@/images/blur-cyan.png'
import blurIndigoImage from '@/images/blur-indigo.png'

// A render of the editor, produced by `npm run docs:shots` in the main repo.
// It replaces a config.json sample that used to sit here and contradicted
// the one thing the homepage promises: a real editor, not a config file.
const EDITOR_SHOT = {
  src: '/images/docs/editor-family-template.webp',
  width: 1600,
  height: 1000,
}

export function Hero() {
  return (
    <div className="overflow-hidden bg-slate-900 dark:-mt-19 dark:-mb-32 dark:pt-19 dark:pb-32">
      <div className="py-16 sm:px-2 lg:relative lg:px-0 lg:py-20">
        <div className="mx-auto grid max-w-2xl grid-cols-1 items-center gap-x-8 gap-y-16 px-4 lg:max-w-8xl lg:grid-cols-2 lg:px-8 xl:gap-x-16 xl:px-12">
          <div className="relative z-10 md:text-center lg:text-left">
            <Image
              className="absolute right-full bottom-full -mr-72 -mb-56 opacity-50"
              src={blurCyanImage}
              alt=""
              width={530}
              height={530}
              unoptimized
              priority
            />
            <div className="relative">
              <p className="inline bg-linear-to-r from-indigo-200 via-sky-400 to-indigo-200 bg-clip-text font-display text-5xl tracking-tight text-transparent">
                Your home. Your data. Your display.
              </p>
              <p className="mt-3 text-2xl tracking-tight text-slate-400">
                A free, open-source smart display for Raspberry Pi. A real
                editor, not a config file. {MODULE_COUNT} modules and{' '}
                {WEATHER_PROVIDER_COUNT} weather providers built in.
              </p>
              <div className="mt-8 flex gap-4 md:justify-center lg:justify-start">
                <Button href="/docs/getting-started">Install it</Button>
                <Button href="/docs/first-screen" variant="secondary">
                  Your first screen
                </Button>
              </div>
            </div>
          </div>
          <div className="relative min-w-0 lg:static xl:pl-10">
            <div className="absolute inset-x-[-50vw] -top-32 -bottom-48 mask-[linear-gradient(transparent,white,white)] lg:-top-32 lg:right-0 lg:-bottom-32 lg:left-[calc(50%+14rem)] lg:mask-none dark:mask-[linear-gradient(transparent,white,transparent)] lg:dark:mask-[linear-gradient(white,white,transparent)]">
              <HeroBackground className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 lg:left-0 lg:translate-x-0 lg:translate-y-[-60%]" />
            </div>
            <div className="relative">
              <Image
                className="absolute -top-64 -right-64"
                src={blurCyanImage}
                alt=""
                width={530}
                height={530}
                unoptimized
                priority
              />
              <Image
                className="absolute -right-44 -bottom-40"
                src={blurIndigoImage}
                alt=""
                width={567}
                height={567}
                unoptimized
                priority
              />
              <div className="absolute inset-0 rounded-2xl bg-linear-to-tr from-sky-300 via-sky-300/70 to-blue-300 opacity-10 blur-lg" />
              <div className="absolute inset-0 rounded-2xl bg-linear-to-tr from-sky-300 via-sky-300/70 to-blue-300 opacity-10" />
              <div className="relative overflow-hidden rounded-2xl bg-[#0A101F]/80 ring-1 ring-white/10 backdrop-blur-sm">
                <div className="absolute -top-px right-11 left-20 h-px bg-linear-to-r from-sky-300/0 via-sky-300/70 to-sky-300/0" />
                <div className="absolute right-20 -bottom-px left-11 h-px bg-linear-to-r from-blue-400/0 via-blue-400 to-blue-400/0" />
                <Image
                  src={EDITOR_SHOT.src}
                  alt="The Home Screens editor with a family dashboard on the canvas: clock, greeting, weather, calendar and a countdown."
                  width={EDITOR_SHOT.width}
                  height={EDITOR_SHOT.height}
                  className="block h-auto w-full"
                  unoptimized
                  priority
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
