/**
 * The app's names for Baritone's open type registries, so props like
 * `font="serif"` type-check.
 *
 * Every name here MUST have a value in `lib/theme.ts`; one without resolves
 * to nothing at runtime.
 */
declare module "@saintly-software/baritone" {
  interface FontRegistry {
    /** The Iowan Old Style stack. */
    serif: true;
  }

  interface LineHeightRegistry {
    /** Tight display leading for serif titles. */
    title: true;
    /** Loose lyric leading, with room for per-line rhyme badges. */
    lyric: true;
  }

  interface FontWeightRegistry {
    /** Between the built-in `default` and `semibold`. */
    medium: true;
  }

  interface FontSizeRegistry {
    /** Between the built-in `xs` and `sm`. */
    nav: true;
  }
}

export {};
