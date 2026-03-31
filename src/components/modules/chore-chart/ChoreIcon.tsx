'use client';

import type { LucideIcon } from 'lucide-react';
import {
  // Member icons
  User, UserRound, Baby, Crown, Star, Heart, Smile, PersonStanding,
  CircleUser, ShieldUser, Cat, Dog,
  // Chore icons
  Bed, BedDouble, Trash2, Utensils, UtensilsCrossed, CookingPot,
  Shirt, WashingMachine, Sparkles, BrushCleaning, SprayCan,
  Droplets, Bath, ShowerHead,
  BookOpen, Notebook, Music, GlassWater,
  Flower2, Leaf, TreeDeciduous,
  Mail, Mailbox, ShoppingCart, ShoppingBag, Car,
  Recycle, TowelRack, Bone,
  HandPlatter, Lamp, Wrench, Scissors, Package,
  Home, Key, Lightbulb, Wifi,
  // New chore icons
  Toilet, SoapDispenserDroplet, PawPrint, Footprints,
  Shovel, PaintRoller, Hammer, ChefHat,
  Microwave, Refrigerator, Apple, Coffee, Egg, Pill,
  ToyBrick, Backpack, Dumbbell, AlarmClock, Timer,
  Fence, Bike, Blinds,
} from 'lucide-react';

// ── Icon registry ─────────────────────────────────────────────────

interface IconDef {
  component: LucideIcon;
  label: string;
  defaultColor: string;  // default badge color when no color is provided
}

const ICON_MAP: Record<string, IconDef> = {
  // People
  user:              { component: User,             label: 'Person',     defaultColor: '#60a5fa' },
  'user-round':      { component: UserRound,        label: 'Person 2',   defaultColor: '#60a5fa' },
  baby:              { component: Baby,              label: 'Baby',       defaultColor: '#f9a8d4' },
  crown:             { component: Crown,             label: 'Royal',      defaultColor: '#fbbf24' },
  star:              { component: Star,              label: 'Star',       defaultColor: '#fbbf24' },
  heart:             { component: Heart,             label: 'Heart',      defaultColor: '#f472b6' },
  smile:             { component: Smile,             label: 'Smile',      defaultColor: '#4ade80' },
  'person-standing': { component: PersonStanding,    label: 'Standing',   defaultColor: '#60a5fa' },
  'circle-user':     { component: CircleUser,        label: 'Avatar',     defaultColor: '#a78bfa' },
  'shield-user':     { component: ShieldUser,        label: 'Guardian',   defaultColor: '#22d3ee' },
  cat:               { component: Cat,               label: 'Cat',        defaultColor: '#fb923c' },
  dog:               { component: Dog,               label: 'Dog',        defaultColor: '#a78bfa' },
  // Chores — cleaning
  sparkles:          { component: Sparkles,          label: 'Clean',      defaultColor: '#fbbf24' },
  'brush-cleaning':  { component: BrushCleaning,     label: 'Scrub',      defaultColor: '#22d3ee' },
  'spray-can':       { component: SprayCan,          label: 'Spray',      defaultColor: '#60a5fa' },
  droplets:          { component: Droplets,          label: 'Water',      defaultColor: '#38bdf8' },
  bath:              { component: Bath,              label: 'Bath',       defaultColor: '#38bdf8' },
  'shower-head':     { component: ShowerHead,        label: 'Shower',     defaultColor: '#22d3ee' },
  'towel-rack':      { component: TowelRack,         label: 'Towels',     defaultColor: '#a78bfa' },
  // Chores — bedroom
  bed:               { component: Bed,               label: 'Bed',        defaultColor: '#818cf8' },
  'bed-double':      { component: BedDouble,         label: 'Beds',       defaultColor: '#818cf8' },
  // Chores — kitchen
  utensils:          { component: Utensils,          label: 'Dishes',     defaultColor: '#f472b6' },
  'utensils-crossed':{ component: UtensilsCrossed,   label: 'Cooking',    defaultColor: '#fb923c' },
  'cooking-pot':     { component: CookingPot,        label: 'Cook',       defaultColor: '#f87171' },
  'hand-platter':    { component: HandPlatter,       label: 'Serve',      defaultColor: '#fbbf24' },
  'glass-water':     { component: GlassWater,        label: 'Drink',      defaultColor: '#38bdf8' },
  // Chores — laundry
  shirt:             { component: Shirt,             label: 'Laundry',    defaultColor: '#a78bfa' },
  'washing-machine': { component: WashingMachine,    label: 'Washer',     defaultColor: '#60a5fa' },
  // Chores — trash
  trash:             { component: Trash2,            label: 'Trash',      defaultColor: '#6b7280' },
  recycle:           { component: Recycle,           label: 'Recycle',    defaultColor: '#4ade80' },
  // Chores — pets
  bone:              { component: Bone,              label: 'Pet',        defaultColor: '#fb923c' },
  // Chores — outdoor
  flower:            { component: Flower2,           label: 'Garden',     defaultColor: '#f472b6' },
  leaf:              { component: Leaf,              label: 'Yard',       defaultColor: '#4ade80' },
  tree:              { component: TreeDeciduous,     label: 'Tree',       defaultColor: '#4ade80' },
  car:               { component: Car,               label: 'Car',        defaultColor: '#6b7280' },
  mail:              { component: Mail,              label: 'Mail',       defaultColor: '#60a5fa' },
  mailbox:           { component: Mailbox,           label: 'Mailbox',    defaultColor: '#fb923c' },
  // Chores — errands
  'shopping-cart':   { component: ShoppingCart,      label: 'Groceries',  defaultColor: '#4ade80' },
  'shopping-bag':    { component: ShoppingBag,       label: 'Shopping',   defaultColor: '#f472b6' },
  // Chores — learning
  'book-open':       { component: BookOpen,          label: 'Read',       defaultColor: '#818cf8' },
  notebook:          { component: Notebook,          label: 'Homework',   defaultColor: '#fbbf24' },
  music:             { component: Music,             label: 'Music',      defaultColor: '#e879f9' },
  // Chores — home
  lamp:              { component: Lamp,              label: 'Lights',     defaultColor: '#fbbf24' },
  wrench:            { component: Wrench,            label: 'Fix',        defaultColor: '#6b7280' },
  scissors:          { component: Scissors,          label: 'Trim',       defaultColor: '#f87171' },
  package:           { component: Package,           label: 'Package',    defaultColor: '#a78bfa' },
  home:              { component: Home,              label: 'Home',       defaultColor: '#60a5fa' },
  key:               { component: Key,               label: 'Key',        defaultColor: '#fbbf24' },
  lightbulb:         { component: Lightbulb,         label: 'Light',      defaultColor: '#fbbf24' },
  wifi:              { component: Wifi,              label: 'WiFi',       defaultColor: '#22d3ee' },
  // Chores — bathroom
  toilet:            { component: Toilet,            label: 'Toilet',     defaultColor: '#38bdf8' },
  soap:              { component: SoapDispenserDroplet, label: 'Soap',    defaultColor: '#22d3ee' },
  // Chores — pets
  'paw-print':       { component: PawPrint,          label: 'Pet Care',   defaultColor: '#fb923c' },
  footprints:        { component: Footprints,        label: 'Walk',       defaultColor: '#a78bfa' },
  // Chores — outdoor / maintenance
  shovel:            { component: Shovel,            label: 'Shovel',     defaultColor: '#6b7280' },
  'paint-roller':    { component: PaintRoller,       label: 'Paint',      defaultColor: '#f472b6' },
  hammer:            { component: Hammer,            label: 'Repair',     defaultColor: '#6b7280' },
  fence:             { component: Fence,             label: 'Yard',       defaultColor: '#a78bfa' },
  bike:              { component: Bike,              label: 'Bike',       defaultColor: '#4ade80' },
  // Chores — kitchen
  'chef-hat':        { component: ChefHat,           label: 'Chef',       defaultColor: '#fbbf24' },
  microwave:         { component: Microwave,         label: 'Microwave',  defaultColor: '#6b7280' },
  refrigerator:      { component: Refrigerator,      label: 'Fridge',     defaultColor: '#38bdf8' },
  apple:             { component: Apple,             label: 'Snack',      defaultColor: '#f87171' },
  coffee:            { component: Coffee,            label: 'Coffee',     defaultColor: '#a78bfa' },
  egg:               { component: Egg,               label: 'Breakfast',  defaultColor: '#fbbf24' },
  // Chores — health / routine
  pill:              { component: Pill,              label: 'Medicine',   defaultColor: '#f472b6' },
  'alarm-clock':     { component: AlarmClock,        label: 'Wake Up',    defaultColor: '#fbbf24' },
  timer:             { component: Timer,             label: 'Timer',      defaultColor: '#fb923c' },
  dumbbell:          { component: Dumbbell,          label: 'Exercise',   defaultColor: '#4ade80' },
  // Chores — kids
  'toy-brick':       { component: ToyBrick,          label: 'Toys',       defaultColor: '#f87171' },
  backpack:          { component: Backpack,          label: 'School',     defaultColor: '#60a5fa' },
  // Chores — windows
  blinds:            { component: Blinds,            label: 'Blinds',     defaultColor: '#6b7280' },
};

export function getIconDef(name: string): IconDef | undefined {
  return ICON_MAP[name];
}

// ── Curated icon sets for the picker ──────────────────────────────

export const MEMBER_ICONS = [
  'user', 'user-round', 'baby', 'circle-user', 'person-standing',
  'smile', 'crown', 'star', 'heart', 'shield-user', 'cat', 'dog',
];

export const CHORE_ICONS = [
  'bed', 'bed-double', 'sparkles', 'brush-cleaning', 'spray-can',
  'trash', 'utensils', 'utensils-crossed', 'cooking-pot', 'hand-platter',
  'shirt', 'washing-machine', 'towel-rack', 'droplets', 'bath', 'shower-head',
  'toilet', 'soap',
  'bone', 'paw-print', 'footprints',
  'flower', 'leaf', 'tree', 'recycle', 'shovel', 'fence',
  'paint-roller', 'hammer', 'blinds',
  'chef-hat', 'microwave', 'refrigerator', 'apple', 'coffee', 'egg',
  'book-open', 'notebook', 'music', 'glass-water',
  'pill', 'alarm-clock', 'timer', 'dumbbell',
  'toy-brick', 'backpack',
  'mail', 'mailbox', 'shopping-cart', 'shopping-bag', 'car', 'bike',
  'lamp', 'wrench', 'scissors', 'package', 'home', 'key', 'lightbulb', 'wifi',
];

// ── Prefix convention ─────────────────────────────────────────────
// Stored in config as "lucide:icon-name" to distinguish from emoji strings.

function isLucideIcon(value: string): boolean {
  return value.startsWith('lucide:');
}

function lucideIconName(value: string): string {
  return value.replace('lucide:', '');
}

export function toLucideValue(name: string): string {
  return `lucide:${name}`;
}

// ── Render component ──────────────────────────────────────────────

interface ChoreIconProps {
  value: string;             // "lucide:icon-name" or legacy emoji
  size?: number;             // container size in px
  color?: string;            // override badge color (falls back to icon's default)
  className?: string;
  bare?: boolean;            // if true, render icon without badge background
}

export default function ChoreIcon({ value, size = 24, color, className, bare }: ChoreIconProps) {
  if (!value) return null;

  if (isLucideIcon(value)) {
    const name = lucideIconName(value);
    const def = ICON_MAP[name];
    if (!def) return null;
    const Icon = def.component;
    const badgeColor = color ?? def.defaultColor;
    const iconSize = Math.round(size * 0.6);

    if (bare) {
      return <Icon size={size} color={badgeColor} strokeWidth={1.75} className={className} />;
    }

    return (
      <span
        className={`inline-flex items-center justify-center shrink-0 ${className ?? ''}`}
        style={{
          width: size,
          height: size,
          borderRadius: size * 0.25,
          backgroundColor: `${badgeColor}20`,
          color: badgeColor,
        }}
      >
        <Icon size={iconSize} strokeWidth={2} />
      </span>
    );
  }

  // Legacy emoji fallback
  return <span className={className} style={{ fontSize: size * 0.75 }}>{value}</span>;
}
