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
import { MODULE_SHOWCASE } from '@/lib/module-showcase-data';

// Icons keyed by the names in MODULE_SHOWCASE; the lists themselves live in
// src/lib/module-showcase-data.ts so a test can hold them to MODULE_COUNT.
const icons: Record<string, LucideIcon> = {
  'Full Screen/Calendar': Columns3,
  'Full Screen/Weather': CloudSun,
  'Full Screen/Chore Chart': ClipboardList,
  'Full Screen/Meal Planner': UtensilsCrossed,
  'Full Screen/News': Newspaper,
  'Full Screen/Photo Viewer': Image,
  Clock, Calendar: CalendarDays, Countdown: Hourglass, Date: Calendar, 'Year Progress': BarChart3, 'Multi-Month': CalendarRange,
  Weather: CloudSun, 'Moon Phase': Moon, 'Sunrise / Sunset': Sunrise, 'Air Quality': Wind, 'Rain Map': CloudRain,
  News: Newspaper, 'Stock Ticker': TrendingUp, Crypto: Bitcoin, 'Sports Scores': Trophy, Standings: Medal,
  'Dad Joke': Laugh, Quote, 'Word of the Day': BookOpen, 'This Day in History': History,
  'To-Do List': ListTodo, 'Sticky Note': StickyNote, Greeting: HandMetal, Todoist: ListChecks, 'Garbage Day': Trash2,
  Affirmations: Sparkles, 'Meal Planner': UtensilsCrossed, 'Chore Chart': ClipboardList,
  Text: Type, Image: ImageIcon, Video, 'Photo Slideshow': Image, 'QR Code': QrCode, 'Web Embed': Globe, Icon: Star,
  'Shape & Divider': Shapes, 'Display Control': LayoutGrid, Traffic: Car,
};

const categories: Record<string, { icon: LucideIcon; label: string }[]> = Object.fromEntries(
  Object.entries(MODULE_SHOWCASE).map(([category, names]) => [
    category,
    names.map((label) => ({ label, icon: icons[`${category}/${label}`] ?? icons[label] ?? Star })),
  ]),
);

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
