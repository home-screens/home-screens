/**
 * Browser-side geometry checks for a rendered module.
 *
 * Overflow past the outer box is only half of "fits". A fixed-width column can
 * hold content wider than itself without growing anything measurable on the
 * root — the content just renders over the neighbouring column — and that is
 * invisible to `scrollWidth`. The landscape Panorama hero did exactly this:
 * the temperature and its icon spilled out of the 34% left column and over
 * the temperature ribbon, and every overflow assertion in the suite passed.
 *
 * So the check is pairwise: no two *parts* may overlap. A part is any element
 * inside `root` carrying a `data-testid`; ancestor/descendant pairs are
 * skipped because containment is not collision. Overlays that are meant to
 * sit on top of other parts (the hourly spline, for instance) are excluded by
 * test id.
 *
 * Passed straight to `page.evaluate`, so it must stay self-contained: no
 * closure over module scope, only the argument it is given.
 */
export interface PartReport {
  /** Parts considered. Assert a floor on this, or an empty `overlaps` is vacuous. */
  count: number;
  /** Pairs of parts whose boxes intersect by more than the tolerance on both axes. */
  overlaps: string[];
  /** Parts whose box extends past the root's box. */
  escaped: string[];
}

export interface PartQuery {
  /** Selector for the root, resolved with `document.querySelector`. */
  rootSelector: string;
  /** Test ids to leave out (deliberate overlays). */
  ignore?: string[];
  /** Intersection depth, in px, below which two boxes are treated as touching. Default 2. */
  tolerance?: number;
}

export function measureParts(q: PartQuery): PartReport {
  const root = document.querySelector(q.rootSelector);
  if (!root) return { count: 0, overlaps: [`root ${q.rootSelector} not found`], escaped: [] };
  const tol = q.tolerance ?? 2;
  const ignore = new Set(q.ignore ?? []);

  const parts = Array.from(root.querySelectorAll<HTMLElement>('[data-testid]'))
    .filter((el) => !ignore.has(el.getAttribute('data-testid') ?? ''))
    .map((el) => ({ el, rect: el.getBoundingClientRect(), id: el.getAttribute('data-testid') ?? '' }))
    .filter((p) => p.rect.width > 0 && p.rect.height > 0);

  const label = (p: { el: HTMLElement; id: string }) => {
    const text = (p.el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 18);
    return text ? `${p.id} "${text}"` : p.id;
  };
  const box = (r: DOMRect) => `${r.left.toFixed(0)},${r.top.toFixed(0)} ${r.width.toFixed(0)}x${r.height.toFixed(0)}`;

  const overlaps: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    for (let j = i + 1; j < parts.length; j++) {
      const a = parts[i], b = parts[j];
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const ox = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left);
      const oy = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top);
      if (ox > tol && oy > tol) {
        overlaps.push(`${label(a)} [${box(a.rect)}] and ${label(b)} [${box(b.rect)}] overlap by ${ox.toFixed(0)}x${oy.toFixed(0)}px`);
      }
    }
  }

  const rr = root.getBoundingClientRect();
  const escaped: string[] = [];
  for (const p of parts) {
    const r = p.rect;
    if (r.left < rr.left - tol || r.top < rr.top - tol || r.right > rr.right + tol || r.bottom > rr.bottom + tol) {
      escaped.push(`${label(p)} [${box(r)}] extends past the root [${box(rr)}]`);
    }
  }

  return { count: parts.length, overlaps, escaped };
}
