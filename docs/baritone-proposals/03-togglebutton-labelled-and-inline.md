# Proposal: a labelled arm and an `inline`/`text` appearance for `ToggleButton`

**Package:** `@saintly-software/baritone` (observed against `1.0.0-alpha.6`)
**Type:** component API extension
**Status:** proposal for discussion
**Depends on / relates to:** alternative to [`02-headless-toggle.md`](./02-headless-toggle.md) + [`01-selectable-surface-recipe.md`](./01-selectable-surface-recipe.md). This is the smallest, most conservative option; it is **less agnostic** than 01+02 (see trade-offs).

---

## Problem

`ToggleButton` today is **icon-only** and renders a square, chrome-bearing control. A
consumer who wants toggle semantics on **visible text** — a togglable label, a filter
that reads as text, a run of words that flows inline — cannot use it, because:

- `icon: PressedSlot<React.ReactNode>` is the content, and
- `"aria-label": PressedSlot<string>` is **required** (there's no visible text to name
  it), and
- there is no `children` and no text/inline appearance.

This is the mirror of a gap `Button` has *already solved*. `Button` supports both a
labelled arm and an icon-only arm, discriminated by props, and it already has a
non-solid, reads-as-text appearance:

- `SolidButtonProps` → `appearance?: "solid"`
- `TextButtonProps` → `appearance: "text"`, `variant?: TextSize`, labelled
  (`children` required, `aria-label?: never`)
- `IconButtonProps` → icon-only, `aria-label` required
- `ButtonProps = SolidButtonProps | TextButtonProps | IconButtonProps`

`ToggleButton` should gain the same labelled-vs-icon split, plus the `text` (and/or a
new `inline`) appearance, so toggle semantics are available on text.

## Proposal

Extend `ToggleButton` into a discriminated union mirroring `Button`:

- **Icon-only arm** — today's behavior, unchanged: `icon` + required `aria-label`,
  square chrome.
- **Labelled arm** — `children` is the visible label and the accessible name; `icon`
  and `aria-label` become `never` (same discriminant discipline `Button` uses to keep
  the two arms from overlapping).
- **Appearance** — support `appearance: "text"` (chrome-light, reads as text) and,
  ideally, an `appearance: "inline"` that flows with surrounding text (no forced
  inline-flex box) so a toggle can sit inside a paragraph or a line.

Everything else stays as-is: controlled/uncontrolled `value`/`defaultValue`,
`onChange: ToggleButtonChange`, `intent`, `saliency` (off = ghost/`low`, on =
configurable), `disabled`/`disabledReason`, `className`, `ref`.

### Sketch

```tsx
// Icon-only arm — unchanged from today.
interface IconToggleButtonProps extends ToggleButtonBaseProps {
  icon: PressedSlot<React.ReactNode>;
  "aria-label": PressedSlot<string>;
  children?: never;
}

// New labelled arm — visible text is the accessible name.
interface LabelledToggleButtonProps extends ToggleButtonBaseProps {
  children: React.ReactNode;
  "aria-label"?: never;
  icon?: never;                       // optionally allow startIcon/endIcon, like Button
  appearance?: "solid" | "text" | "inline";
}

export type ToggleButtonProps =
  | (IconToggleButtonProps & ToggleButtonControlledProps)
  | (IconToggleButtonProps & ToggleButtonUncontrolledProps)
  | (LabelledToggleButtonProps & ToggleButtonControlledProps)
  | (LabelledToggleButtonProps & ToggleButtonUncontrolledProps);
```

### Usage

```tsx
<ToggleButton appearance="inline" value={pressed} onChange={setPressed} intent="primary">
  {label}
</ToggleButton>
```

## Acceptance criteria

- [ ] Labelled arm accepts `children` as visible label + accessible name; `aria-label`
      and `icon` are `never` on that arm (type-enforced, matching `Button`).
- [ ] Icon-only arm unchanged; existing `ToggleButton` call sites keep compiling and
      behaving identically.
- [ ] `appearance: "text"` (and, if accepted, `"inline"`) renders chrome-light and
      reads as text; the pressed state still uses the shared intent recipe.
- [ ] `intent`/`saliency`/`disabled`/`disabledReason`/controlled+uncontrolled all work
      on the labelled arm.
- [ ] Focus ring and dark-mode washes verified for each appearance × intent.

## Trade-offs vs proposals 01 + 02

- **Pro:** smallest change; fully idiomatic (reuses the exact labelled/icon-only split
  and `appearance: "text"` concept `Button` already ships); nothing new to learn.
- **Con:** **less agnostic.** It keeps layout/box opinions *inside* the component, so
  it serves "a togglable label/inline text" well but still won't cover the other
  selectable shapes (table rows, day cells, custom-laid-out regions) that 01+02 cover
  by separating colour (recipe) from behavior (headless `Toggle`) from element
  (consumer's). An `appearance: "inline"` that has to fill/flow in a consumer-specific
  way (e.g. grow to fill remaining space on a line) will still need consumer CSS.

## Recommendation

Ship this if the priority is a fast, low-risk win for the common "toggle on visible
text" case. Prefer 01+02 if the goal is to stop consumers hand-rolling selectable
regions in general; the two directions are compatible (this could even be built on top
of a headless `Toggle` later).
