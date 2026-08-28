# RhymeLab style guide

Conventions for how we write code in this repo. This is a living document — start
with **[Ordering of things](#ordering-of-things)** and add sections as house style
gets pinned down.

Prose-level standards (`Pick` over `Omit`, marking methods `async`, the
unit/integration test split) live in [`CLAUDE.md`](../CLAUDE.md); this doc is about
the *shape* of a file.

## Ordering of things

Every module reads top-to-bottom in the same order, so you always know where to
look: the headline first, its supporting cast below, and the type noise last.

Within a file, declarations appear in this order:

1. **File docstring** — a `/** … */` block at the very top, where one is
   appropriate. Say what the file *is* and any invariant a reader needs before
   touching it. Use `/**`, not `//`.
2. **Imports.**
3. **`SCREAMING_SNAKE_CASE` constants** — the module's fixed vocabulary and
   configuration (enums-as-`as const`, colour tables, tunables, keys).
4. **`export default`** — if the file has one.
5. **The main export** — the one thing the file is *about*. It usually shares its
   name with the file or the directory (`entry.ts` → `EntryController`,
   `NavBar/index.tsx` → `NavBar`). It goes near the top so the reader meets the
   headline before the supporting cast.
6. **Top-level functions** — everything the main export leans on, plus any other
   free functions. See [call-graph order](#call-graph-order) below.
7. **Other constants** — module-level values that aren't the SCREAMING_SNAKE
   vocabulary and aren't the main export: singletons, lookup tables built from the
   functions above, and the like.
8. **TypeScript types** — every `type` and `interface`, all the way at the bottom.
   This includes *derived* types (`type Foo = (typeof FOO)[number]`): the constant
   stays up in section 3, its type comes down here. Types are erased at runtime and
   resolve regardless of position, so nothing is lost by collecting them last.

A file rarely has all eight — skip whatever doesn't apply and keep the survivors in
this relative order.

### Call-graph order

Top-level functions are ordered by *who calls whom*, depth-first: a function
appears **above** the functions it calls. Read the file top-down and you descend
the call tree — the entry point first, the leaves last.

> If `A` calls `B`, `B` calls `D`, and `D` calls `C`, the order is **A, B, D, C**.

The main export (section 5) is effectively the root of this tree; its helpers
follow beneath it in the order it reaches them.

### Always use the `function` keyword

Top-level functions are declared with `function`, never assigned as an arrow to a
`const`:

```ts
// yes
export function entryKindLabel(kind: EntryKind): string { … }

// no
export const entryKindLabel = (kind: EntryKind): string => { … }
```

Two reasons: `function` declarations hoist, so call-graph order never fights the
compiler; and `function foo` reads as a definition at a glance, where `const foo =`
reads as a value and buries the fact that it's callable. (Arrows are still the norm
*inside* function bodies, for callbacks, and for genuinely value-like things such
as React components assigned to a memoized `const`.)

### When runtime order wins

This ordering is about *reading*, and it must never break *running*. Module-level
code is evaluated top-to-bottom and `const`s are not hoisted, so if a genuine
initialization dependency forces a different order — an "other constant" that a
later one is built from, say — the dependency wins. Prefer to restructure so the
canonical order still holds; only depart when correctness requires it, and leave a
one-line comment saying why.

### Out of scope

Generated files are exempt — they're owned by their generator, not by us
(`app/backend/api/src/_generated/**`, `routeTree.gen.ts`, `*.d.ts`). Test files
(`*.test.ts`, `*.integration.test.ts`) and build config (`.config/**`) follow the
spirit where it applies but aren't held to the "main export" shape.
