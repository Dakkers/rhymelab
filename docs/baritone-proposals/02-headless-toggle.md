# Proposal: a headless, content-agnostic `Toggle` primitive (toggle behavior without chrome)

**Package:** `@saintly-software/baritone` (observed against `1.0.0-alpha.6`)
**Type:** new primitive component (behavior-only)
**Status:** proposal for discussion
**Depends on / relates to:** [`01-selectable-surface-recipe.md`](./01-selectable-surface-recipe.md) (the natural styling partner), [`03-togglebutton-labelled-and-inline.md`](./03-togglebutton-labelled-and-inline.md) (alternative, less agnostic)

---

## Problem

Baritone's only toggle primitive, `ToggleButton`, welds **toggle behavior** to a
specific **chrome**: it is icon-only and renders a square, control-shaped button.

From `ToggleButton`'s current type surface (`ToggleButtonBaseProps`):

- `"aria-label": PressedSlot<string>` — **required**, because the button is icon-only
  and has no visible text to name it.
- `icon: PressedSlot<React.ReactNode>` — the content is an icon, full stop.
- `intent?`, `saliency?` (off renders `low`/ghost, on renders configurable), `size?`
  (square at every size), `disabled?`, `disabledReason?`, `className?`, `ref?`.
- Controlled (`value`) / uncontrolled (`defaultValue`) + `onChange: ToggleButtonChange`.

There is **no `children`** and **no `render`** prop. So a consumer who needs
*toggle semantics on something that isn't a square icon button* — a run of text, a
table row, a list item, a custom-laid-out region — cannot use it and instead
re-implements the controlled/uncontrolled + `aria-pressed` + keyboard + disabled
machinery by hand on a bare `<button>`.

That machinery is genuinely fiddly and worth centralizing:

- controlled vs uncontrolled state with `value`/`defaultValue`/`onChange`,
- `aria-pressed` wiring,
- `disabled` modelled as `aria-disabled` (kept focusable to surface `disabledReason`)
  with clicks/keyboard vetoed — which is exactly how Baritone's `Button` and
  `ToggleButton` already choose to model disablement.

## What already exists in Baritone

- `ToggleButton` — has all the behavior, but only in icon-only chrome.
- `Button` — already demonstrates the pattern of a **polymorphic render seam**: its
  docstring notes "The rendering lives in `InternalButton`; `Button` just forwards its
  props … `render` props in through `InternalButton`'s `htmlAttrs` seam."
- Public render utilities are already exported: `useRender`, `composeRefs`,
  `type RenderProp`.
- Baritone is built on **Base UI** (`@base-ui/react`, a peer dependency), which ships
  an unstyled `Toggle` — so a thin, house-styled-but-chrome-free wrapper is consistent
  with how other Base UI parts are likely wrapped.

## Proposal

Factor the toggle machinery out of `ToggleButton` into a **headless `Toggle`** that is
content-agnostic and appearance-agnostic:

- accepts arbitrary **`children`**,
- is **polymorphic** via the existing `render` / `RenderProp` + `useRender` seam, so it
  can render as a `Text`, a `span`, a `td`, etc.,
- manages **controlled/uncontrolled** pressed state, `aria-pressed`, keyboard
  activation, and `disabled`/`disabledReason` exactly as `ToggleButton` does today,
- ships **no visual chrome** of its own (no background, border, size, or padding).

`ToggleButton` can then be re-expressed as `Toggle` + its icon-only styling, keeping
its API 100% unchanged.

### Sketch

```tsx
export interface ToggleProps {
  /** Controlled pressed state. */
  value?: boolean;
  /** Uncontrolled initial pressed state. Default false. */
  defaultValue?: boolean;
  onChange?: (value: boolean, event: React.MouseEvent) => void;

  /** Disabled via aria-disabled (stays focusable to surface disabledReason). */
  disabled?: boolean;
  disabledReason?: React.ReactNode;

  /** Polymorphic element, via the existing render seam. */
  render?: RenderProp;

  className?: string;
  children?: React.ReactNode;
  ref?: React.Ref<HTMLElement>;
}
```

Reuse the existing `ToggleButtonChange` shape (or export a shared
`ToggleChange`) so the two stay consistent.

### Composition — reconstructing a "selectable text region"

With [`01-selectable-surface-recipe.md`](./01-selectable-surface-recipe.md), a
text-first toggle is just the two orthogonal primitives combined — neither of which is
the specific use case, which is the sign the abstraction is right:

```tsx
import { Toggle, Text, cx, focusRingRecipe } from "@saintly-software/baritone";
import { selectableRecipe } from "@saintly-software/baritone"; // proposal 01

<Toggle
  value={pressed}
  onChange={setPressed}
  render={<Text lineHeight="lyric" />}
  className={cx(selectableRecipe({ intent: "primary" }), focusRingRecipe({ intent: "primary" }))}
>
  {label}
</Toggle>
```

The consumer owns the element (`Text`) and any layout (e.g. a flex item that grows to
fill space); Baritone owns behavior and colour.

## Acceptance criteria

- [ ] `Toggle` exported from the package root with `type ToggleProps`.
- [ ] Accepts `children` and a `render` prop (via `useRender`/`RenderProp`); renders no
      chrome of its own.
- [ ] Controlled (`value`) and uncontrolled (`defaultValue`) modes with `onChange`;
      sets `aria-pressed`; keyboard-activates like a button.
- [ ] `disabled`/`disabledReason` modelled with `aria-disabled` (focusable, clicks &
      keyboard vetoed) — matching `Button`/`ToggleButton`.
- [ ] `ToggleButton` re-implemented on top of `Toggle` with **no public API change**
      (regression-tested against its current behavior).
- [ ] `ref` forwards to the rendered element via `composeRefs`.

## Non-goals

- No default styling, size, or box model — that's the consumer's, optionally via
  proposal 01's recipe.
- Not a radio/segmented control (that's `ToggleGroup`/`RadioGroup`); `Toggle` is a
  single independent on/off.
- Does not change `ToggleButton`'s public API.

## Why this is agnostic

It isolates the one thing that's tedious and error-prone to re-implement — correct,
accessible toggle *behavior* — from every decision about how a toggle *looks* or what
it *contains*. Behavior + colour (proposal 01) compose into any specific toggle shape,
so the system never has to enumerate them.
