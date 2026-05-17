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
  // Reward icons
  Gift, Tv, IceCreamCone, Clapperboard, Pizza, Banknote,
  CircleCheckBig, PartyPopper, Rocket, Gem, Trophy,
  Gamepad2, Headphones, Candy, Cookie, Cake, Palette,
  Ticket, Popcorn, CircleDollarSign, Wallet, BadgeCheck,
  Plane, Tent, Fish, Drama, Puzzle, Sticker, Volleyball,
} from 'lucide-react';

// ── Icon registry ─────────────────────────────────────────────────

interface IconDef {
  component: LucideIcon;
  defaultColor: string;  // default badge color when no color is provided
}

const ICON_MAP: Record<string, IconDef> = {
  // People
  user:              { component: User,             defaultColor: '#60a5fa' },
  'user-round':      { component: UserRound,        defaultColor: '#60a5fa' },
  baby:              { component: Baby,              defaultColor: '#f9a8d4' },
  crown:             { component: Crown,             defaultColor: '#fbbf24' },
  star:              { component: Star,              defaultColor: '#fbbf24' },
  heart:             { component: Heart,             defaultColor: '#f472b6' },
  smile:             { component: Smile,             defaultColor: '#4ade80' },
  'person-standing': { component: PersonStanding,    defaultColor: '#60a5fa' },
  'circle-user':     { component: CircleUser,        defaultColor: '#a78bfa' },
  'shield-user':     { component: ShieldUser,        defaultColor: '#22d3ee' },
  cat:               { component: Cat,               defaultColor: '#fb923c' },
  dog:               { component: Dog,               defaultColor: '#a78bfa' },
  // Chores — cleaning
  sparkles:          { component: Sparkles,          defaultColor: '#fbbf24' },
  'brush-cleaning':  { component: BrushCleaning,     defaultColor: '#22d3ee' },
  'spray-can':       { component: SprayCan,          defaultColor: '#60a5fa' },
  droplets:          { component: Droplets,          defaultColor: '#38bdf8' },
  bath:              { component: Bath,              defaultColor: '#38bdf8' },
  'shower-head':     { component: ShowerHead,        defaultColor: '#22d3ee' },
  'towel-rack':      { component: TowelRack,         defaultColor: '#a78bfa' },
  // Chores — bedroom
  bed:               { component: Bed,               defaultColor: '#818cf8' },
  'bed-double':      { component: BedDouble,         defaultColor: '#818cf8' },
  // Chores — kitchen
  utensils:          { component: Utensils,          defaultColor: '#f472b6' },
  'utensils-crossed':{ component: UtensilsCrossed,   defaultColor: '#fb923c' },
  'cooking-pot':     { component: CookingPot,        defaultColor: '#f87171' },
  'hand-platter':    { component: HandPlatter,       defaultColor: '#fbbf24' },
  'glass-water':     { component: GlassWater,        defaultColor: '#38bdf8' },
  // Chores — laundry
  shirt:             { component: Shirt,             defaultColor: '#a78bfa' },
  'washing-machine': { component: WashingMachine,    defaultColor: '#60a5fa' },
  // Chores — trash
  trash:             { component: Trash2,            defaultColor: '#6b7280' },
  recycle:           { component: Recycle,           defaultColor: '#4ade80' },
  // Chores — pets
  bone:              { component: Bone,              defaultColor: '#fb923c' },
  // Chores — outdoor
  flower:            { component: Flower2,           defaultColor: '#f472b6' },
  leaf:              { component: Leaf,              defaultColor: '#4ade80' },
  tree:              { component: TreeDeciduous,     defaultColor: '#4ade80' },
  car:               { component: Car,               defaultColor: '#6b7280' },
  mail:              { component: Mail,              defaultColor: '#60a5fa' },
  mailbox:           { component: Mailbox,           defaultColor: '#fb923c' },
  // Chores — errands
  'shopping-cart':   { component: ShoppingCart,      defaultColor: '#4ade80' },
  'shopping-bag':    { component: ShoppingBag,       defaultColor: '#f472b6' },
  // Chores — learning
  'book-open':       { component: BookOpen,          defaultColor: '#818cf8' },
  notebook:          { component: Notebook,          defaultColor: '#fbbf24' },
  music:             { component: Music,             defaultColor: '#e879f9' },
  // Chores — home
  lamp:              { component: Lamp,              defaultColor: '#fbbf24' },
  wrench:            { component: Wrench,            defaultColor: '#6b7280' },
  scissors:          { component: Scissors,          defaultColor: '#f87171' },
  package:           { component: Package,           defaultColor: '#a78bfa' },
  home:              { component: Home,              defaultColor: '#60a5fa' },
  key:               { component: Key,               defaultColor: '#fbbf24' },
  lightbulb:         { component: Lightbulb,         defaultColor: '#fbbf24' },
  wifi:              { component: Wifi,              defaultColor: '#22d3ee' },
  // Chores — bathroom
  toilet:            { component: Toilet,            defaultColor: '#38bdf8' },
  soap:              { component: SoapDispenserDroplet, defaultColor: '#22d3ee' },
  // Chores — pets
  'paw-print':       { component: PawPrint,          defaultColor: '#fb923c' },
  footprints:        { component: Footprints,        defaultColor: '#a78bfa' },
  // Chores — outdoor / maintenance
  shovel:            { component: Shovel,            defaultColor: '#6b7280' },
  'paint-roller':    { component: PaintRoller,       defaultColor: '#f472b6' },
  hammer:            { component: Hammer,            defaultColor: '#6b7280' },
  fence:             { component: Fence,             defaultColor: '#a78bfa' },
  bike:              { component: Bike,              defaultColor: '#4ade80' },
  // Chores — kitchen
  'chef-hat':        { component: ChefHat,           defaultColor: '#fbbf24' },
  microwave:         { component: Microwave,         defaultColor: '#6b7280' },
  refrigerator:      { component: Refrigerator,      defaultColor: '#38bdf8' },
  apple:             { component: Apple,             defaultColor: '#f87171' },
  coffee:            { component: Coffee,            defaultColor: '#a78bfa' },
  egg:               { component: Egg,               defaultColor: '#fbbf24' },
  // Chores — health / routine
  pill:              { component: Pill,              defaultColor: '#f472b6' },
  'alarm-clock':     { component: AlarmClock,        defaultColor: '#fbbf24' },
  timer:             { component: Timer,             defaultColor: '#fb923c' },
  dumbbell:          { component: Dumbbell,          defaultColor: '#4ade80' },
  // Chores — kids
  'toy-brick':       { component: ToyBrick,          defaultColor: '#f87171' },
  backpack:          { component: Backpack,          defaultColor: '#60a5fa' },
  // Chores — windows
  blinds:            { component: Blinds,            defaultColor: '#6b7280' },
  // Rewards
  gift:              { component: Gift,              defaultColor: '#f472b6' },
  tv:                { component: Tv,                defaultColor: '#60a5fa' },
  'ice-cream-cone':  { component: IceCreamCone,      defaultColor: '#f9a8d4' },
  clapperboard:      { component: Clapperboard,      defaultColor: '#fbbf24' },
  pizza:             { component: Pizza,             defaultColor: '#fb923c' },
  banknote:          { component: Banknote,          defaultColor: '#4ade80' },
  'circle-check-big':{ component: CircleCheckBig,    defaultColor: '#4ade80' },
  'party-popper':    { component: PartyPopper,       defaultColor: '#e879f9' },
  rocket:            { component: Rocket,            defaultColor: '#f87171' },
  gem:               { component: Gem,               defaultColor: '#818cf8' },
  trophy:            { component: Trophy,            defaultColor: '#fbbf24' },
  'gamepad-2':       { component: Gamepad2,          defaultColor: '#a78bfa' },
  headphones:        { component: Headphones,        defaultColor: '#60a5fa' },
  candy:             { component: Candy,             defaultColor: '#f472b6' },
  cookie:            { component: Cookie,            defaultColor: '#fb923c' },
  cake:              { component: Cake,              defaultColor: '#f9a8d4' },
  palette:           { component: Palette,           defaultColor: '#e879f9' },
  ticket:            { component: Ticket,            defaultColor: '#fbbf24' },
  popcorn:           { component: Popcorn,           defaultColor: '#f87171' },
  'circle-dollar-sign': { component: CircleDollarSign, defaultColor: '#4ade80' },
  wallet:            { component: Wallet,            defaultColor: '#a78bfa' },
  'badge-check':     { component: BadgeCheck,        defaultColor: '#22d3ee' },
  plane:             { component: Plane,             defaultColor: '#38bdf8' },
  tent:              { component: Tent,              defaultColor: '#4ade80' },
  fish:              { component: Fish,              defaultColor: '#38bdf8' },
  drama:             { component: Drama,             defaultColor: '#e879f9' },
  puzzle:            { component: Puzzle,            defaultColor: '#60a5fa' },
  sticker:           { component: Sticker,           defaultColor: '#fbbf24' },
  volleyball:        { component: Volleyball,        defaultColor: '#fb923c' },
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

  // Support both "lucide:gift" prefixed values and bare names like "gift"
  const resolvedName = isLucideIcon(value) ? lucideIconName(value) : null;
  const def = resolvedName ? ICON_MAP[resolvedName] : ICON_MAP[value];

  if (def) {
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
