/**
 * RhymeLab's declarations for Baritone's *open* typographic vocabularies — the
 * half of the theme contract that only exists in the consuming app. Baritone
 * ships each registry empty, so the matching prop stays a loose `string` until an
 * app names its values here; declaring them is what makes `<Text font="serif">`
 * and `<Heading lineHeight="title">` type-check (and `font="serfi"` or an unnamed
 * leading fail).
 *
 * Every name has a value side in `lib/theme.ts`, which hands the matching family,
 * leading, weight and size to `BaritoneTheme` (`fonts={{ serif: … }}`,
 * `lineHeights={{ title: … }}`, `weights={{ medium: … }}`, `sizes={{ nav: … }}`).
 * That's what publishes the `--font-serif` / `--lineHeight-<name>` /
 * `--fontWeight-<name>` / `--fontSize-<name>` custom properties the props read.
 * Keep the two in step: a name declared here but not published there resolves to
 * nothing.
 */
declare module "@saintly-software/baritone" {
  interface FontRegistry {
    /** The Iowan Old Style stack — titles, bylines and the lyrics themselves. */
    serif: true;
  }

  interface LineHeightRegistry {
    /** Tight display leading (1.04) for the serif page and entry titles. */
    title: true;
    /** Loose lyric-body leading (1.85) — leaves room for the per-line rhyme badges. */
    lyric: true;
  }

  interface FontWeightRegistry {
    /** Medium (500) — between the built-in `default` and `semibold`; the nav links. */
    medium: true;
  }

  interface FontSizeRegistry {
    /** The compact nav-link label (0.82rem), a step between built-in `xs` and `sm`. */
    nav: true;
  }
}

export {};
