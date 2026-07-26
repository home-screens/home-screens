'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Clock, CalendarDays, Hourglass, Calendar, BarChart3, CalendarRange, Columns3,
  CloudSun, Moon, Sunrise, Wind, CloudRain,
  Newspaper, TrendingUp, Bitcoin, Trophy, Medal,
  Laugh, Quote, BookOpen, History,
  ListTodo, StickyNote, HandMetal, ListChecks, Trash2, Sparkles, UtensilsCrossed, ClipboardList,
  Type, ImageIcon, Image, Video, QrCode, Globe, LayoutGrid, Star, Shapes,
  Car,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Container } from '@/components/Container';
import { SectionHeader } from '@/components/SectionHeader';
import { MODULE_COUNT } from '@/lib/stats';

interface ModuleItem {
  icon: LucideIcon;
  label: string;
}

// These lists must total MODULE_COUNT, which the section header advertises.
// Health & Fitness is the one registry category with no tab here: it ships no
// built-in modules and only appears in the app once a plugin uses it.
const categories: Record<string, ModuleItem[]> = {
  'Full Screen': [
    { icon: Columns3, label: 'Calendar' },
    { icon: ClipboardList, label: 'Chore Chart' },
    { icon: UtensilsCrossed, label: 'Meal Planner' },
    { icon: Image, label: 'Photo Viewer' },
  ],
  'Time & Date': [
    { icon: Clock, label: 'Clock' },
    { icon: CalendarDays, label: 'Calendar' },
    { icon: Hourglass, label: 'Countdown' },
    { icon: Calendar, label: 'Date' },
    { icon: BarChart3, label: 'Year Progress' },
    { icon: CalendarRange, label: 'Multi-Month' },
  ],
  'Weather & Environment': [
    { icon: CloudSun, label: 'Weather' },
    { icon: Moon, label: 'Moon Phase' },
    { icon: Sunrise, label: 'Sunrise / Sunset' },
    { icon: Wind, label: 'Air Quality' },
    { icon: CloudRain, label: 'Rain Map' },
  ],
  'News & Finance': [
    { icon: Newspaper, label: 'News' },
    { icon: TrendingUp, label: 'Stock Ticker' },
    { icon: Bitcoin, label: 'Crypto' },
    { icon: Trophy, label: 'Sports Scores' },
    { icon: Medal, label: 'Standings' },
  ],
  'Knowledge & Fun': [
    { icon: Laugh, label: 'Dad Joke' },
    { icon: Quote, label: 'Quote' },
    { icon: BookOpen, label: 'Word of the Day' },
    { icon: History, label: 'This Day in History' },
  ],
  'Personal': [
    { icon: ListTodo, label: 'To-Do List' },
    { icon: StickyNote, label: 'Sticky Note' },
    { icon: HandMetal, label: 'Greeting' },
    { icon: ListChecks, label: 'Todoist' },
    { icon: Trash2, label: 'Garbage Day' },
    { icon: Sparkles, label: 'Affirmations' },
    { icon: UtensilsCrossed, label: 'Meal Planner' },
    { icon: ClipboardList, label: 'Chore Chart' },
  ],
  'Media & Display': [
    { icon: Type, label: 'Text' },
    { icon: ImageIcon, label: 'Image' },
    { icon: Video, label: 'Video' },
    { icon: Image, label: 'Photo Slideshow' },
    { icon: QrCode, label: 'QR Code' },
    { icon: Globe, label: 'Web Embed' },
    { icon: Star, label: 'Icon' },
    { icon: Shapes, label: 'Shape & Divider' },
    { icon: LayoutGrid, label: 'Display Control' },
  ],
  'Travel': [
    { icon: Car, label: 'Traffic' },
  ],
};

const categoryNames = Object.keys(categories);

export function ModuleShowcase() {
  const [active, setActive] = useState(0);
  const activeName = categoryNames[active];
  const modules = categories[activeName];

  return (
    <section id="modules" className="py-24">
      <Container>
        <div className="mb-12">
          <SectionHeader
            title={
              <>
                <span className="font-mono text-cyan-400">{MODULE_COUNT}</span> modules and counting
              </>
            }
            description={
              <>
                Everything from clocks and calendars to stocks, sports scores, and meal
                planning. All configurable, all composable.
              </>
            }
          />
        </div>

        {/* Category tabs */}
        <div className="relative mb-8">
          <div className="flex gap-1 overflow-x-auto pb-2 scrollbar-none">
            {categoryNames.map((name, i) => (
              <button
                key={name}
                onClick={() => setActive(i)}
                className={`relative whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  i === active
                    ? 'text-cyan-300'
                    : 'text-neutral-500 hover:text-neutral-300'
                }`}
              >
                {i === active && (
                  <motion.div
                    layoutId="module-tab"
                    className="absolute inset-0 rounded-lg border border-cyan-500/30 bg-cyan-500/10"
                    transition={{ type: 'spring', bounce: 0.2, duration: 0.5 }}
                  />
                )}
                <span className="relative z-10">{name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Module grid */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeName}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
          >
            {modules.map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex items-center gap-3 rounded-xl border border-[#222] bg-[#161616] px-4 py-3 transition-colors hover:border-cyan-500/30"
              >
                <Icon className="h-5 w-5 shrink-0 text-cyan-400/70" />
                <span className="text-sm text-neutral-300">{label}</span>
              </div>
            ))}
          </motion.div>
        </AnimatePresence>
      </Container>
    </section>
  );
}
