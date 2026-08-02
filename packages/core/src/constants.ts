/**
 * Shared, framework-free vocabulary for the whole app: the enums the DB columns
 * narrow to, the analysis "modes", and the colour palettes the workbench paints
 * with. Nothing here may import `cloudflare:workers` or any server module — both
 * the client bundle and the Drizzle schema import from here.
 */

/* ------------------------------------------------------------------ */
/* Entries                                                             */
/* ------------------------------------------------------------------ */

/** A library item is a song or a poem. */
export const ENTRY_KINDS = ["song", "poem"] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];

export function entryKindLabel(kind: EntryKind): string {
  return kind === "song" ? "Song" : "Poem";
}

/* ------------------------------------------------------------------ */
/* Sections                                                            */
/* ------------------------------------------------------------------ */

/*
 * Sections are untyped now: lyrics are auto-split on blank lines and each block
 * is labelled positionally ("Section 1", "Section 2", …). The structural-type
 * concept (verse/chorus/…) and its editable picker were removed while the app's
 * scope narrows; the code lives in git history for when structure returns.
 */

/* ------------------------------------------------------------------ */
/* Analysis modes                                                      */
/* ------------------------------------------------------------------ */

/**
 * The analytical lenses that store annotations. Narrowed to `rhyme-scheme` only
 * while the app hardens the rhyme workflow — the other lenses (rhyme-type, sound,
 * theme, device, note) were removed and live in git history (see the note in the
 * workbench README / the commit that deleted them) for when they return.
 * `read` (in `VIEW_MODES`) is the plain reading view and stores nothing.
 */
export const ANNOTATION_MODES = ["rhyme-scheme"] as const;
export type AnnotationMode = (typeof ANNOTATION_MODES)[number];

/** Every mode shown in the mode bar, including the read-only `read` view. */
export const VIEW_MODES = ["read", ...ANNOTATION_MODES] as const;
export type ViewMode = (typeof VIEW_MODES)[number];

/** How rhyme groups are drawn over the lyrics: tinted words, or A/B/C letters. */
export const RHYME_VIEWS = ["colours", "letters"] as const;
export type RhymeView = (typeof RHYME_VIEWS)[number];

/* ------------------------------------------------------------------ */
/* Annotation tiers                                                    */
/* ------------------------------------------------------------------ */

/**
 * The two granularities the workbench annotates at. `basic` works line-by-line
 * (every mode selects whole lines); `advanced` is the future word-level layer —
 * the same modes over individual words — and is deferred, so it renders as a
 * disabled tier for now.
 */
export const ANNOTATION_TIERS = ["basic", "advanced"] as const;
export type AnnotationTier = (typeof ANNOTATION_TIERS)[number];

export interface TierMeta {
  tier: AnnotationTier;
  label: string;
  /** One-line description of what the tier annotates. */
  helper: string;
  /** Whether the tier is selectable yet. `advanced` is deferred. */
  enabled: boolean;
}

export const TIER_META: Record<AnnotationTier, TierMeta> = {
  basic: {
    tier: "basic",
    label: "Basic",
    helper: "Annotate whole lines.",
    enabled: true,
  },
  advanced: {
    tier: "advanced",
    label: "Advanced",
    helper: "Annotate individual words. Coming soon.",
    enabled: false,
  },
};

export interface ModeMeta {
  mode: ViewMode;
  label: string;
  /** The dot/glyph colour in the mode bar and the panel heading. */
  color: string;
  /** One-line instruction shown at the top of the right panel. */
  helper: string;
}

export const MODE_META: Record<ViewMode, ModeMeta> = {
  read: {
    mode: "read",
    label: "Read",
    color: "#9A948A",
    helper: "A clean reading view. Switch modes to start annotating.",
  },
  "rhyme-scheme": {
    mode: "rhyme-scheme",
    label: "Rhyme scheme",
    color: "#EC5C79",
    helper:
      "Check the lines that share a rhyme — click anywhere on a line — then assign a group. ⇧-click for a range. X marks a line that doesn't rhyme.",
  },
};

/* ------------------------------------------------------------------ */
/* Rhyme scheme — the A–F / X groups                                */
/* ------------------------------------------------------------------ */

export const RHYME_GROUPS = ["A", "B", "C", "D", "E", "F", "X"] as const;
export type RhymeGroup = (typeof RHYME_GROUPS)[number];

export interface RhymeGroupColor {
  /** Strong fill — line-end badges and the group buttons. */
  solid: string;
  /** Light wash — the highlight pill behind a word. */
  tint: string;
  /** Readable ink on top of `solid`. */
  ink: string;
}

/**
 * Colours keyed by group letter. `X` (a deliberate non-rhyme) is a flat neutral
 * so it reads as "no colour" rather than as another rhyme family.
 */
export const RHYME_GROUP_COLORS: Record<RhymeGroup, RhymeGroupColor> = {
  A: { solid: "#F2C14E", tint: "#FBEBB8", ink: "#5A4611" },
  B: { solid: "#EC5C79", tint: "#FAD2DB", ink: "#611325" },
  C: { solid: "#2FB9A0", tint: "#BFEEE3", ink: "#0C4136" },
  D: { solid: "#6FB63C", tint: "#D8EEC1", ink: "#294211" },
  E: { solid: "#8B6DF0", tint: "#DAD1FB", ink: "#2C1D63" },
  F: { solid: "#F0973C", tint: "#FBDDBE", ink: "#5C3312" },
  X: { solid: "#B4AFA5", tint: "#E7E3DA", ink: "#3E3B34" },
};
