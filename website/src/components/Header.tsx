'use client';

import Link from 'next/link';
import {
  Popover,
  PopoverButton,
  PopoverBackdrop,
  PopoverPanel,
} from '@headlessui/react';
import { AnimatePresence, motion } from 'framer-motion';
import { Menu, ChevronUp, Github } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Container } from '@/components/Container';
import { Logo } from '@/components/Logo';

const navLinks = [
  { label: 'Features', href: '#features' },
  { label: 'Modules', href: '#modules' },
  { label: 'Templates', href: '#templates' },
  { label: 'Docs', href: '/docs' },
];

function MobileNavLink({
  href,
  children,
  onClick,
}: {
  href: string;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <PopoverButton
      as={Link}
      href={href}
      onClick={onClick}
      className="block text-base font-medium text-neutral-300 hover:text-white"
    >
      {children}
    </PopoverButton>
  );
}

export function Header() {
  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <nav>
        <Container className="flex items-center justify-between py-4">
          {/* Frosted glass background */}
          <div className="absolute inset-0 -z-10 bg-[#0a0a0a]/80 backdrop-blur-md border-b border-white/[0.04]" />

          <div className="flex items-center gap-12">
            <Link href="/" aria-label="Home">
              <Logo />
            </Link>
            <div className="hidden items-center gap-8 lg:flex">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-sm text-neutral-400 transition-colors hover:text-white"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <Link
              href="https://github.com/home-screens/home-screens"
              className="hidden text-neutral-400 transition-colors hover:text-white lg:block"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub"
            >
              <Github className="h-5 w-5" />
            </Link>
            <Button
              href="/docs/getting-started"
              className="hidden lg:inline-flex"
            >
              Get Started
            </Button>

            {/* Mobile menu */}
            <Popover className="lg:hidden">
              {({ open }) => (
                <>
                  <PopoverButton
                    className="relative z-10 -m-2 inline-flex items-center rounded-lg stroke-neutral-400 p-2 hover:stroke-white focus:outline-none"
                    aria-label="Toggle navigation"
                  >
                    {open ? (
                      <ChevronUp className="h-6 w-6 text-neutral-400" />
                    ) : (
                      <Menu className="h-6 w-6 text-neutral-400" />
                    )}
                  </PopoverButton>
                  <AnimatePresence initial={false}>
                    {open && (
                      <>
                        <PopoverBackdrop
                          static
                          as={motion.div}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="fixed inset-0 z-0 bg-black/60 backdrop-blur-sm"
                        />
                        <PopoverPanel
                          static
                          as={motion.div}
                          initial={{ opacity: 0, y: -32 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{
                            opacity: 0,
                            y: -32,
                            transition: { duration: 0.2 },
                          }}
                          className="absolute inset-x-0 top-0 z-0 origin-top rounded-b-2xl bg-[#161616] px-6 pb-6 pt-24 shadow-2xl"
                        >
                          <div className="space-y-4">
                            {navLinks.map((link) => (
                              <MobileNavLink key={link.href} href={link.href}>
                                {link.label}
                              </MobileNavLink>
                            ))}
                          </div>
                          <div className="mt-8 flex flex-col gap-3">
                            <Button
                              href="https://github.com/home-screens/home-screens"
                              variant="outline"
                            >
                              <Github className="h-4 w-4" />
                              GitHub
                            </Button>
                            <Button href="/docs/getting-started">
                              Get Started
                            </Button>
                          </div>
                        </PopoverPanel>
                      </>
                    )}
                  </AnimatePresence>
                </>
              )}
            </Popover>
          </div>
        </Container>
      </nav>
    </header>
  );
}
