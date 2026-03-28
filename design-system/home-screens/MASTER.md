# Home Screens Design System

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** Home Screens
**Generated:** 2026-03-28
**Category:** Smart Home Display / IoT Dashboard / Kiosk Interface
**Stack:** Next.js 16, React 19, Tailwind CSS v4, Framer Motion, Zustand
**Icon Library:** lucide-react (consistent stroke-width, no emoji)
**Font:** Inter (system-ui sans-serif fallback)

---

## Design Philosophy

Home Screens is a dark-first, information-dense smart display system. The UI serves two distinct contexts:

1. **Display** — Fullscreen kiosk (portrait 1080x1920) running on Raspberry Pi in Chromium. No interactive chrome. Content modules render on semi-transparent dark backgrounds with backdrop blur. Readability at distance is paramount.

2. **Editor** — Configuration tool with toolbars, panels, and modals. Dense property editing. Dark neutral palette with blue primary actions. Compact inputs, accordion sections, three-tier input sizing.

Both contexts share the same design tokens but apply them differently.

---

## 1. Color System

### Core Palette (Tailwind Neutral)

| Token | Hex | Usage |
|-------|-----|-------|
| `neutral-100` | `#f5f5f5` | Primary text (headings) |
| `neutral-200` | `#e5e5e5` | Secondary text, button labels |
| `neutral-300` | `#d4d4d4` | Body text on dark surfaces |
| `neutral-400` | `#a3a3a3` | Label text, ghost button text |
| `neutral-500` | `#737373` | Subtle text, section headings, chevrons |
| `neutral-600` | `#525252` | Input borders, disabled text, status dots (off) |
| `neutral-700` | `#404040` | Panel borders, dividers, card borders |
| `neutral-800` | `#262626` | Input backgrounds, surface (elevated) |
| `neutral-900` | `#171717` | Panel backgrounds, modal backgrounds |
| `neutral-950` | `#0a0a0a` | Root background (editor), deepest surface |

### Semantic Colors

| Role | Token | Usage |
|------|-------|-------|
| **Primary** | `blue-600` / `blue-500` (hover) | Interactive elements, active states, primary buttons |
| **Primary muted** | `blue-400` / `blue-300` | Active text indicators, links |
| **Danger** | `red-600` / `red-500` (hover) | Destructive actions, error states |
| **Danger muted** | `red-400` / `red-300` | Error text, error banner text |
| **Success** | `green-400` | Configured status, positive values, completion |
| **Warning** | `amber-400` / `yellow-400` | Caution indicators, unverified states |
| **Warning surface** | `amber-950/30` border `amber-800/50` | Warning banner backgrounds |
| **Error surface** | `red-900/30` border `red-800` | Error banner backgrounds |

### CSS Variables (globals.css)

```css
:root {
  --background: #ffffff;
  --foreground: #171717;
}
@media (prefers-color-scheme: dark) {
  :root {
    --background: #0a0a0a;
    --foreground: #ededed;
  }
}
```

### Display Module Defaults

| Property | Default | Range |
|----------|---------|-------|
| Background | `rgba(0, 0, 0, 0.4)` | Any RGBA |
| Text color | `#ffffff` | Any hex |
| Backdrop blur | `12px` | 0–40px |
| Border radius | `12px` | 0–50px |
| Padding | `16px` | 0–100px |

---

## 2. Typography

### Font Stack

```
Inter, system-ui, sans-serif
```

Loaded via Next.js `next/font/google` as CSS variable `--font-inter`. Alternative options available per-module: Georgia (serif), monospace, system-ui.

### Type Scale

| Context | Size | Weight | Tracking | Tailwind |
|---------|------|--------|----------|----------|
| Section heading | 10px | 600 (semibold) | 0.2em (widest) | `text-[10px] font-semibold uppercase tracking-widest` |
| Compact label | 11px | 400 | normal | `text-[11px]` |
| Input / small text | 12px (xs) | 400 | normal | `text-xs` |
| Body / modal text | 14px (sm) | 400 | normal | `text-sm` |
| Module content | 16px (base) | 400 | normal | `text-base` (runtime adjustable 8–72px) |
| Heading emphasis | 14–18px | 600 | normal | `text-sm font-semibold` / `text-lg font-semibold` |

### Weight Hierarchy

| Weight | Token | Usage |
|--------|-------|-------|
| 300 | `font-light` | Elegant/decorative text (affirmation views) |
| 400 | `font-normal` | Body text, inputs, descriptions |
| 500 | `font-medium` | Buttons, interactive labels |
| 600 | `font-semibold` | Headings, emphasized content |
| 700 | `font-bold` | Strong emphasis (rare) |

### Text Line Heights

- Body: `leading-relaxed` (1.625) for quote/affirmation content
- UI: Default Tailwind line heights per size class
- Module text: configurable via `lineHeight` property

---

## 3. Spacing System

Base unit: **4px** (Tailwind default). The project uses Tailwind's spacing scale throughout.

### Common Spacing Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `gap-0.5` | 2px | Compact label-to-field spacing |
| `gap-1` | 4px | Input/label gaps |
| `gap-1.5` | 6px | Icon + text, icon + status |
| `gap-2` | 8px | Modal content gaps, grid gaps |
| `gap-3` | 12px | Accordion children, dense sections |
| `gap-4` | 16px | Panel margins, standard sections |
| `gap-5` | 20px | Main section spacing |

### Component Padding

| Component | Padding | Tailwind |
|-----------|---------|----------|
| Modal header | 20px H / 12px V | `px-5 py-3` |
| Modal body | 20px H / 16px V | `px-5 py-4` |
| Modal footer | 20px H / 12px V | `px-5 py-3` |
| Property panel | 16px all | `p-4` |
| Compact input | 8px H / 4px V | `px-2 py-1` |
| Modal input | 10px H / 6px V | `px-2.5 py-1.5` |
| Button sm | 8px H / 4px V | `px-2 py-1` |
| Button md | 12px H / 6px V | `px-3 py-1.5` |

### Section Spacing

| Context | Spacing | Tailwind |
|---------|---------|----------|
| Accordion content | 12px gap + 8px bottom | `space-y-3 pb-2` |
| Property sections | 8–20px | `space-y-2` to `space-y-5` |
| Panel main sections | 20px | `space-y-5` |
| Input field groups | 2px | `gap-0.5` |

---

## 4. Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `rounded` | 4px | Compact inputs (property panel) |
| `rounded-md` | 6px | Buttons, modal inputs, tabs |
| `rounded-lg` | 8px | Plugin cards, banners |
| `rounded-xl` | 12px | Modals, large cards |
| `rounded-full` | 9999px | Toggles, status dots, pills |

Module default: `12px` (runtime adjustable 0–50px)

---

## 5. Z-Index Scale

Defined as semantic Tailwind tokens in `@theme`:

| Token | Value | Usage |
|-------|-------|-------|
| `z-modal` | 60 | CRUDModalShell, main dialogs |
| `z-confirm` | 70 | ConfirmModal, confirmation dialogs |
| `z-nested` | 80 | Nested modals, popovers |
| (inline) | 9997 | Sleep overlay |
| (inline) | 9999 | Drag ghost |

**Rule:** Always use semantic tokens. Never use arbitrary z-index values for new components.

---

## 6. Shadows & Elevation

The project uses minimal shadow — hierarchy is established through **background color depth** and **borders**, not box-shadow.

| Context | Shadow | Usage |
|---------|--------|-------|
| None (default) | — | Inputs, buttons, panels |
| `shadow-2xl` | Deep | ConfirmModal only |
| Backdrop | `bg-black/60` | Modal overlay (60% opacity) |

### Display Module Elevation

Modules use `backdrop-filter: blur()` instead of shadow for depth on the kiosk display:
- Default blur: `12px`
- Semi-transparent backgrounds: `rgba(0, 0, 0, 0.4)`

---

## 7. Component Library

### Button (`src/components/ui/Button.tsx`)

Four variants, two sizes:

| Variant | Background | Text | Hover |
|---------|-----------|------|-------|
| `primary` | `bg-blue-600` | `text-white` | `bg-blue-500` |
| `secondary` | `bg-neutral-700` | `text-neutral-200` | `bg-neutral-600` |
| `danger` | `bg-red-600` | `text-white` | `bg-red-500` |
| `ghost` | transparent | `text-neutral-400` | `text-neutral-200 bg-neutral-800` |

| Size | Padding | Font |
|------|---------|------|
| `sm` | `px-2 py-1` | `text-xs` |
| `md` | `px-3 py-1.5` | `text-sm` |

Base: `rounded-md font-medium transition-colors`
Disabled: `opacity-50 cursor-not-allowed`

### Input Classes (`src/components/ui/input-classes.ts`)

Three tiers — single source of truth:

| Tier | Context | Class |
|------|---------|-------|
| `INPUT_CLASS` | Property panel (compact) | `w-full px-2 py-1 text-xs bg-neutral-800 border border-neutral-600 rounded text-neutral-200` |
| `NESTED_INPUT_CLASS` | Indented/nested fields | `w-full px-2 py-0.5 text-xs bg-neutral-700 border border-neutral-600 rounded text-neutral-200` |
| `MODAL_INPUT_CLASS` | CRUD modals (larger) | `w-full px-2.5 py-1.5 text-sm bg-neutral-800 border border-neutral-600 rounded-md text-neutral-200 placeholder:text-neutral-500 focus:outline-none focus:border-neutral-400 transition-colors` |

### Toggle (`src/components/ui/Toggle.tsx`)

- Container: `w-9 h-5 rounded-full`
- Knob: `w-4 h-4 rounded-full bg-white`
- On: `bg-blue-600`, knob `translate-x-4`
- Off: `bg-neutral-600`, knob at rest

### Slider (`src/components/ui/Slider.tsx`)

- Native `<input type="range">` with `accent-blue-500`
- Flex column layout with `gap-1`

### ColorPicker (`src/components/ui/ColorPicker.tsx`)

- Swatch: `w-8 h-8 rounded border border-neutral-600`
- Hex input: `w-28` with INPUT_CLASS styling
- Hex validation on blur with draft state

### StatusDot (`src/components/ui/StatusDot.tsx`)

- Dot: `w-1.5 h-1.5 rounded-full`
- Configured: `bg-green-400`
- Not configured: `bg-neutral-600`

### SectionHeading (`src/components/ui/SectionHeading.tsx`)

```
text-[10px] font-semibold uppercase tracking-widest text-neutral-500
```
With trailing divider: `flex-1 border-t border-neutral-700/50`

---

## 8. Modal Patterns

### CRUDModalShell (Large modals)

```
Position:   fixed inset-0 z-modal
Backdrop:   bg-black/60
Container:  bg-neutral-900 border border-neutral-700 rounded-xl
Size:       max-w-4xl h-[85vh]
Layout:     flex flex-col (header / body / footer)
Header:     px-5 py-3 border-b border-neutral-700
Footer:     px-5 py-3 border-t border-neutral-700
```

### ConfirmModal (Small dialogs)

```
Position:   fixed inset-0 z-confirm
Backdrop:   bg-black/60
Container:  bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl
Size:       max-w-sm
Variants:   danger (red button) or primary (blue button)
Keyboard:   Enter = confirm, Escape = cancel
```

---

## 9. Accordion Sections

Used throughout the PropertyPanel for collapsible groups.

```
Trigger:    flex items-center gap-1.5 py-1.5
Chevron:    w-3 h-3 text-neutral-500 transition-transform duration-200
            rotate-90 when open
Title:      text-xs font-semibold text-neutral-500 uppercase
Content:    space-y-3 pb-2
Animation:  Framer Motion height 0→auto, opacity 0→1, duration 0.2s
```

---

## 10. Animation System

### Timing & Easing

| Context | Duration | Easing |
|---------|----------|--------|
| Hover / color | instant | `transition-colors` |
| Accordion open/close | 200ms | `easeInOut` |
| Content transitions | 600ms | `easeInOut` |
| Transform changes | 200ms | `transition-transform` |
| View transitions | 600ms | `ease-in-out` |

### Framer Motion Patterns

**Content swap (AnimatePresence):**
```tsx
initial={{ opacity: 0, y: 8 }}
animate={{ opacity: 1, y: 0 }}
exit={{ opacity: 0, y: -8 }}
transition={{ duration: 0.6, ease: 'easeInOut' }}
```

**Expand/collapse:**
```tsx
initial={{ height: 0, opacity: 0 }}
animate={{ height: 'auto', opacity: 1 }}
exit={{ height: 0, opacity: 0 }}
transition={{ duration: 0.2, ease: 'easeInOut' }}
```

### CSS Animations

| Animation | Type | Duration |
|-----------|------|----------|
| `animate-pulse` | Tailwind built-in | Infinite |
| `animate-spin` | Tailwind built-in | Infinite (loaders) |
| `animate-ticker-scroll` | Custom keyframes | Linear infinite |
| `_textGradientSweep` | Module effect | 3s ease infinite |
| `_textGlow` | Module effect | 2s ease-in-out alternate |
| `_marquee*` | Module effect | Linear infinite (4 dirs) |

### View Transitions API (Screen rotation)

- GPU-accelerated: `translate3d`, `scale3d`, `opacity`
- Effects: fade, slide, slide-up, zoom, flip, blur, crossfade, none
- Default: 600ms ease-in-out

---

## 11. State Indicators

### Status Colors

| State | Color | Example |
|-------|-------|---------|
| Configured/Active | `green-400` | StatusDot, live indicators |
| Live/Pulsing | `green-400 animate-pulse` | `w-1 h-1 rounded-full` |
| Error | `red-400` / `red-300` | Error text, failed steps |
| Warning | `amber-400` / `amber-300` | Unverified plugin |
| Pending | `neutral-600` | Not configured, disabled |
| Loading | `blue-500` | Progress bars, spinners |
| Complete | `green-500` | Progress bar completion |

### Banner Patterns

| Type | Background | Border | Text |
|------|-----------|--------|------|
| Error | `bg-red-900/30` | `border-red-800` | `text-red-300` |
| Warning | `bg-amber-950/30` | `border-amber-800/50` | `text-amber-300` title, `text-amber-400/80` body |
| Info | `bg-neutral-800/50` | `border-neutral-700` | `text-neutral-300` |

### Progress Bar

```
Track:    h-1.5 rounded-full bg-neutral-800 overflow-hidden
Fill:     h-full rounded-full transition-all duration-500 ease-out
Colors:   bg-blue-500 (in progress), bg-green-500 (done), bg-red-500 (failed)
```

---

## 12. Layout Patterns

### Editor Layout

```
Root:           bg-neutral-950 text-neutral-100 font-sans antialiased h-screen overflow-hidden
Canvas area:    flex with scrolling
Property panel: w-72 flex-shrink-0 bg-neutral-900 border-l border-neutral-700 p-4 overflow-y-auto
Min width:      768px responsive guard
```

### Display Layout

```
Root:           Full viewport, no chrome
Orientation:    Portrait 1080x1920 (configurable)
Viewport:       width=device-width, initial-scale=1, no user scaling
Background:     Configurable (solid, gradient, image)
Modules:        Absolutely positioned within grid
```

### Tab Patterns

```
Container:   flex gap-1 bg-neutral-800 rounded-md p-0.5
Active tab:  bg-neutral-700 text-neutral-100
Inactive:    text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800
Size:        px-3 py-1.5 text-xs font-medium rounded-md transition-colors
```

### Selection States

```
Selected:    border-2 border-blue-500
Unselected:  border-2 border-transparent hover:border-neutral-600
Transition:  transition-colors
```

---

## 13. Empty States

Pattern: centered flex column with muted icon + descriptive text + optional action.

```tsx
<div className="flex flex-col items-center gap-3 py-10 text-neutral-500">
  <IconComponent size={32} strokeWidth={1.5} className="opacity-30" />
  <p className="text-sm text-center">Descriptive message</p>
</div>
```

Icons used: `LayoutDashboard`, `PackageSearch`, `MousePointerClick` (from lucide-react).

---

## 14. Loading States

### Skeleton Shimmer

Animated placeholder bars replacing content during load. Uses Tailwind `animate-pulse` on neutral-colored blocks.

### Button Loading

```tsx
{loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Label'}
```

### Text Loading

```tsx
{loading ? 'Uploading...' : 'Upload Photos'}
```

---

## 15. Accessibility Standards

| Rule | Standard |
|------|----------|
| Text contrast | 4.5:1 minimum (body), 3:1 (large text) |
| Touch targets | 44x44px minimum (pagination dots, swatches) |
| Focus management | Focus trap in modals (Escape to close) |
| Keyboard | Enter confirms, Escape cancels in dialogs |
| Icons | `aria-label` on interactive icon-only buttons; `aria-hidden` on decorative |
| Screen readers | `aria-current` on active pagination dots |
| Motion | Respect `prefers-reduced-motion` for view transitions |
| Cursor | `cursor-none` class applied on idle (kiosk mode) |

---

## 16. Anti-Patterns (Do NOT Use)

- **Emojis as icons** — Always use lucide-react SVGs
- **Arbitrary z-index** — Use `z-modal` / `z-confirm` / `z-nested` tokens
- **Hardcoded hex in components** — Use Tailwind neutral/blue/red/green tokens
- **Magic number spacing** — Use Tailwind spacing scale (4px increments)
- **Multiple input class definitions** — Import from `ui/input-classes.ts`
- **Layout-shifting animations** — Use transform/opacity only
- **Pure #000000 backgrounds** — Use `neutral-950` (#0a0a0a) to avoid OLED smear
- **Shadows for hierarchy** — Use background depth + borders instead
- **Demo/fallback API keys** — Always require user to configure their own
- **Instant state changes** — Always use transition-colors or Framer Motion

---

## 17. Pre-Delivery Checklist

### Visual Quality
- [ ] No emojis as icons (lucide-react SVGs only)
- [ ] All icons from lucide-react with consistent size classes
- [ ] Semantic color tokens used (no ad-hoc hex values)
- [ ] Input classes imported from `ui/input-classes.ts` (not redefined)
- [ ] Button variants from `ui/Button.tsx` (not hand-rolled)

### Interaction
- [ ] All clickable elements have `cursor-pointer`
- [ ] Hover states with `transition-colors` (150–300ms)
- [ ] Disabled states use `opacity-50 cursor-not-allowed`
- [ ] Modals have keyboard support (Escape to close, Enter to confirm)
- [ ] Touch targets >= 44x44px on interactive elements

### Dark Mode
- [ ] Primary text contrast >= 4.5:1 against neutral-900/950
- [ ] Borders visible (`border-neutral-700` on `bg-neutral-900`)
- [ ] Modal backdrop is `bg-black/60`
- [ ] No pure #000000 backgrounds (use neutral-950)

### Layout
- [ ] Editor respects 768px minimum width
- [ ] Property panel fixed at `w-72`
- [ ] Modal heights max `h-[85vh]`
- [ ] Z-index uses semantic tokens
- [ ] Spacing follows 4px base rhythm

### Accessibility
- [ ] `aria-label` on icon-only buttons
- [ ] `aria-hidden` on decorative icons
- [ ] Focus states visible for keyboard navigation
- [ ] `prefers-reduced-motion` respected in view transitions
