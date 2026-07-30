/**
 * Baritone's font vocabulary is the one *open* part of its theme contract —
 * everything else (intents, sizes, weights) is a closed tuple compiled into the
 * design system, but the set of families an app wants only exists here. Baritone
 * ships `FontRegistry` empty, so `font` is a loose `string` until an app declares
 * its names; declaring `serif` is what makes `<Text font="serif">` type-check and
 * `font="serfi"` fail.
 *
 * The value side lives in `routes/__root.tsx`, which hands the matching family
 * stack to `BaritoneTheme` as `fonts={{ serif: … }}`. Keep the two in step: a
 * name declared here but not published there resolves to nothing.
 */
declare module "@saintly-software/baritone" {
  interface FontRegistry {
    /** The Iowan Old Style stack — titles, bylines and the lyrics themselves. */
    serif: true;
  }
}

export {};
