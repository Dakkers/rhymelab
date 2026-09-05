/**
 * Shared, framework-free vocabulary for the whole app: the enums the DB columns
 * narrow to, the analysis "modes", and the colour palettes the workbench paints
 * with. Nothing here may import `cloudflare:workers` or any server module — both
 * the client bundle and the Drizzle schema import from here.
 */

/** A library item is a song or a poem. */
export const ENTRY_KINDS = ["song", "poem"] as const;

/** How rhyme groups are drawn over the lyrics: tinted lines, or A/B/C letters. */
export const RHYME_VIEWS = ["colours", "letters"] as const;

/** The accent colour + one-line instruction for the rhyme-scheme panel. */
export const RHYME_ACCENT = "#EC5C79";
export const RHYME_HELPER =
  "Check the lines that share a rhyme — click anywhere on a line — then assign a group. ⇧-click for a range. X marks a line that doesn't rhyme.";

export const RHYME_GROUPS = ["A", "B", "C", "D", "E", "F", "X"] as const;

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

export function entryKindLabel(kind: EntryKind): string {
  return kind === "song" ? "Song" : "Poem";
}

export type EntryKind = (typeof ENTRY_KINDS)[number];

export type RhymeView = (typeof RHYME_VIEWS)[number];

export type RhymeGroup = (typeof RHYME_GROUPS)[number];

export interface RhymeGroupColor {
  /** Strong fill — line-end badges and the group buttons. */
  solid: string;
  /** Light wash — the highlight pill behind a word. */
  tint: string;
  /** Readable ink on top of `solid`. */
  ink: string;
}
