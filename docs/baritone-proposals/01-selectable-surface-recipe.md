# Proposal: a `selected` (pressed) state for the interactive-surface washes, applyable to any element

**Package:** `@saintly-software/baritone` (observed against `1.0.0-alpha.6`)
**Type:** styling primitive / recipe enhancement
**Status:** proposal for discussion
**Depends on / relates to:** [`02-headless-toggle.md`](./02-headless-toggle.md) (composes with this), [`03-togglebutton-labelled-and-inline.md`](./03-togglebutton-labelled-and-inline.md) (alternative, less agnostic)

---

## Problem

Consumers keep hand-rolling the same interactive state → colour mapping for elements
that Baritone doesn't ship as components: a **selectable region** whose look is

- **rest:** transparent / no chrome (reads as its surrounding content, not a control),
- **hover:** a hairline border + a faint surface wash,
- **selected / pressed:** an intent-tinted fill + border,
- **focus:** the standard focus ring.

Examples that are *not* any existing Baritone component: a selectable table row, a
calendar day cell, a token/word inside a block of text, a filter "pill" that should
read as text rather than as a chip, a selectable line in a list-like editor.

Today the consumer writes something like this by hand:

```css
.thing {
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--rl-radius-sm);
  transition: background .12s, border-color .12s;
}
.thing:hover            { border-color: var(--hairline-strong); background: var(--surface-2); }
.thing[aria-pressed="true"] {
  border-color: color-mix(in srgb, var(--brand) 45%, transparent);
  background:   color-mix(in srgb, var(--brand) 10%, transparent);
}
```

Two things go wrong when consumers do this:

1. **The washes aren't theme-correct.** A hand-authored `color-mix(... srgb ...)` tint
   does not track the design system's light/dark tokens or its oklch wash math, so
   the selected state drifts from the rest of the UI (especially in dark mode).
2. **The focus ring is usually dropped.** Consumers reaching for a bare element forget
   `:focus-visible`, so the region is keyboard-operable but invisibly focused.

## What already exists in Baritone

Baritone **already computes exactly these washes** — it just doesn't expose a
`selected` resting state, and the interactive variant is scoped to "surface" element
types rather than being applyable to an arbitrary element.

From `surfaceRecipe` (exported as `surfaceRecipe`, `SurfaceVariants`) — its own
docstring:

> Surfaces are static (no hover); pair with the shared `focusRingRecipe` (the
> `intent` variant publishes the ring colour) for when they're made interactive — or
> set the **`interactive`** variant to add **hover/active washes (computed in oklch
> from the `default` background, like the component recipe)** for a surface that *is*
> the control, e.g. a clickable/linkable `Card`.

So the primitive for "hover/active washes from a token, in oklch" is present. The
gaps are:

- there is **no `selected` / pressed resting wash** (only hover + active), and
- it's framed around `Card`/`Page`/`Accordion` surfaces, not offered as a
  general "apply this to your own element" recipe.

Relevant already-public API this proposal builds on (all currently exported from the
package root):

- `surfaceRecipe`, `type SurfaceVariants`
- `componentIntentRecipe`, `type ComponentIntentVariants`
- `focusRingRecipe`, `type FocusRingVariants`, `focusRingColorVar`
- `cx`
- theme constants `Intent`, `Saliency`, `INTENTS`, `SURFACE_SALIENCIES`

## Proposal

Expose a **selectable** interactive recipe (either a new `selectableRecipe`, or a
`selected` state added to `surfaceRecipe`'s `interactive` variant) that a consumer can
apply to **any element they own** via `className`. It owns the state→appearance
mapping only; it makes no assumptions about the element, its box, or its layout.

State model (driven by attributes the consumer already sets for a11y):

| State      | Selector the recipe keys off        | Appearance                                   |
| ---------- | ----------------------------------- | -------------------------------------------- |
| rest       | (default)                           | transparent bg, transparent border           |
| hover      | `:hover` (not disabled)             | faint surface wash + hairline border         |
| selected   | `[aria-pressed="true"]` / `[data-selected]` | intent-tinted fill + intent border   |
| focus      | `:focus-visible`                    | delegate to `focusRingRecipe`                |
| disabled   | `[aria-disabled="true"]`            | muted, no hover/active response              |

Notes:

- Support **both** `aria-pressed` (toggle semantics) and `[data-selected]`
  (single/multi-select semantics like a selected row or day) so the recipe is usable
  regardless of which a11y pattern the consumer's element implements.
- Washes computed the same way as `surfaceRecipe.interactive` (oklch from the token),
  so light/dark and every intent stay consistent with the rest of the system.
- `intent` and `saliency` variants matching the existing recipes (`INTENTS`,
  `SURFACE_SALIENCIES`), so the selected tint follows the chosen intent.

### Sketch of consumer usage

```tsx
import { cx, focusRingRecipe } from "@saintly-software/baritone";
import { selectableRecipe } from "@saintly-software/baritone"; // new

<button
  type="button"
  aria-pressed={selected}
  onClick={toggle}
  className={cx(
    selectableRecipe({ intent: "primary", saliency: "low" }),
    focusRingRecipe({ intent: "primary" }),
  )}
>
  {children}
</button>
```

The consumer keeps full control of the **element** (`button`, `td`, `li`, `span`), its
**padding/radius/layout**, and its **children**. Baritone owns only the colour of each
interactive state.

## Acceptance criteria

- [ ] A recipe (new or extended) that a consumer can put on an arbitrary element via
      `cx(...)`, keyed off `aria-pressed`/`[data-selected]` for the selected state.
- [ ] Selected, hover, and active washes are computed from theme tokens (oklch), and
      verified correct in both light and dark themes for every `intent`.
- [ ] `intent` and `saliency` variants mirror the existing recipe conventions.
- [ ] Documented alongside `surfaceRecipe`, with the "for a surface that *is* the
      control" guidance extended to the general element case.
- [ ] Type export mirroring `SurfaceVariants` (e.g. `SelectableVariants`).

## Non-goals

- **No element, box, or layout opinions.** No `display`, `flex`, `width`, `padding`,
  or `border-radius` baked in — those belong to the consumer. This recipe is *colour
  and state only*.
- Not a component. (A component that pairs this with toggle behaviour is
  [`02-headless-toggle.md`](./02-headless-toggle.md).)
- Does not replace `ToggleButton` / `Chip` / clickable `Card`; it's the escape hatch
  for the many "selectable region" shapes that aren't worth a bespoke component.

## Why this is the most agnostic option

It hands the consumer exactly the piece a design system is uniquely positioned to own
— the theme-correct mapping from interaction state to colour — and nothing else. The
consumer's element and layout stay theirs, so one recipe serves selectable rows, day
cells, text tokens, and pills alike without the system needing to anticipate any of
them.
