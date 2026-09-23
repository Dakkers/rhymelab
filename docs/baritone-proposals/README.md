# Baritone proposals

Three self-contained proposals for `@saintly-software/baritone` (observed against
`1.0.0-alpha.6`), each readable in isolation. They came out of a RhymeLab feature that
needed a **selectable, text-first region** (a togglable run of text that reads as text,
not as a button) — a shape Baritone can *almost* express today: the toggle behavior
lives in `ToggleButton` but only as an icon-only square, and the hover/active washes
live in `surfaceRecipe.interactive` but only for surface components and without a
selected state. Each doc is framed generically, not around that one feature.

| # | Doc | One line | Agnostic-ness |
| - | --- | -------- | ------------- |
| 01 | [selectable-surface-recipe](./01-selectable-surface-recipe.md) | Add a `selected`/pressed state to the interactive washes and let it apply to any element via `cx(...)` | Most agnostic — colour/state only |
| 02 | [headless-toggle](./02-headless-toggle.md) | Factor a chrome-free, content-agnostic `Toggle` (behavior only) out of `ToggleButton` | Most agnostic — behavior only |
| 03 | [togglebutton-labelled-and-inline](./03-togglebutton-labelled-and-inline.md) | Give `ToggleButton` a labelled arm + `text`/`inline` appearance (mirrors `Button`) | Least agnostic — smallest change |

**How they relate:** 01 (colour) + 02 (behavior) compose into any selectable shape,
applied to an element the consumer owns — that's the recommended pair. 03 is the
smallest, most conservative alternative for the narrower "toggle on visible text" case;
it's compatible with 01+02 and could later be built on top of the headless `Toggle`.

**Division of labor these propose:** Baritone owns state→appearance mapping, toggle
behavior, chrome reset, and focus; the consuming app owns the element, the layout, and
what its content is.
