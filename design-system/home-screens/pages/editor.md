# Editor Page — Design Overrides

> These rules override `MASTER.md` when building or modifying editor UI.

---

## Context

The editor is a dense configuration tool at `/editor`. It has a canvas area, a toolbar, a property panel (right sidebar), and modal dialogs. The user manipulates module instances via drag-and-drop and property editing.

---

## Layout

| Region | Width | Background | Border |
|--------|-------|-----------|--------|
| Root | 100vw x 100vh | `bg-neutral-950` | — |
| Toolbar | full width | `bg-neutral-900` | `border-b border-neutral-700` |
| Canvas | flex-1 | configurable | — |
| Property Panel | `w-72` fixed | `bg-neutral-900` | `border-l border-neutral-700` |

Minimum viewport width: **768px** (responsive guard).

---

## Property Panel

- Padding: `p-4`
- Section spacing: `space-y-5`
- Uses `AccordionSection` for collapsible groups
- Input tier: `INPUT_CLASS` (compact, 12px text)
- Nested fields: `NESTED_INPUT_CLASS` (even more compact)
- Position/size inputs: `grid grid-cols-2 gap-2`

---

## Modals

All modals use z-index semantic tokens:
- `z-modal` (60) for CRUDModalShell
- `z-confirm` (70) for ConfirmModal
- `z-nested` (80) for nested popovers

Input tier in modals: `MODAL_INPUT_CLASS` (14px text, rounded-md)

---

## Tabs (Plugin Store, Image Browser)

```
Container:   flex gap-1 bg-neutral-800 rounded-md p-0.5
Active:      bg-neutral-700 text-neutral-100
Inactive:    text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800
```

---

## Special Patterns

### Plugin Cards
```
flex items-start gap-3 p-3 rounded-lg border border-neutral-700 bg-neutral-800/50
```

### Selection (images, modules)
```
Selected:    border-2 border-blue-500
Unselected:  border-2 border-transparent hover:border-neutral-600
```

### Drag & Drop
- Drag ghost: `z-index: 9999`
- Uses @dnd-kit with Zustand store integration
- Overlay renders module preview during drag
