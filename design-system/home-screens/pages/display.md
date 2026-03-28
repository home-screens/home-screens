# Display Page — Design Overrides

> These rules override `MASTER.md` when building or modifying display/kiosk UI.

---

## Context

The display is a fullscreen kiosk view at `/display`. It runs on Raspberry Pi in Chromium kiosk mode with a portrait 1080x1920 screen. There is no interactive chrome — no toolbars, no panels. Modules render at absolute positions on a configurable background.

---

## Key Constraints

- **No user interaction expected** (except idle cursor hiding)
- **Readability at distance** — text must be large and high-contrast
- **Always-on** — performance and memory matter
- **Portrait orientation** (1080x1920 default, configurable)
- **Cursor hidden** when idle via `.cursor-idle` class

---

## Module Styling (Runtime Configurable)

Each module instance has a `ModuleStyle` object:

| Property | Default | Range |
|----------|---------|-------|
| `backgroundColor` | `rgba(0, 0, 0, 0.4)` | Any RGBA |
| `textColor` | `#ffffff` | Any hex |
| `fontSize` | `16px` | 8–72px |
| `fontFamily` | `Inter, system-ui, sans-serif` | Inter, Georgia, monospace, system-ui |
| `borderRadius` | `12px` | 0–50px |
| `padding` | `16px` | 0–100px |
| `backdropBlur` | `12px` | 0–40px |
| `letterSpacing` | `0px` | configurable |
| `lineHeight` | `normal` | configurable |

---

## Background Options

The display background supports:
- **Solid color** — single hex value
- **Gradient** — configurable direction and stops
- **Image** — uploaded or URL, with optional overlay

---

## Screen Transitions (View Transitions API)

When rotating between screens (profiles), the display uses the View Transitions API:

| Property | Value |
|----------|-------|
| Duration | 600ms |
| Easing | ease-in-out |
| Effects | fade, slide, slide-up, zoom, flip, blur, crossfade, none |
| GPU layers | transform, opacity only |
| Excluded | Pagination dots, sleep overlay |

---

## Pagination Dots

```
Touch target:   44x44px (accessible minimum)
Dot size:       visual dot within larger target
Active:         aria-current="true"
Accessible:     aria-label="Screen N of M"
```

Excluded from view transitions (stays stable during screen animation).

---

## Module Categories on Display

34 module types across categories: time, weather, calendar, information, media, lifestyle, productivity, sports, system. Each renders independently within its positioned container.

Font sizes trend larger than editor UI. Typical module heading: 18–32px. Body: 14–20px. Module-specific.

---

## Performance Rules

- Lazy load non-visible modules
- Use `will-change: transform` sparingly for animated elements
- Ticker/marquee animations: `linear infinite` (no easing for continuous motion)
- Image optimization: WebP/AVIF, appropriate sizing for 1080px width
- Minimize reflows — absolute positioning avoids layout recalculation
