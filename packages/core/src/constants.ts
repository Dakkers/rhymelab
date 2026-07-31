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

/**
 * A section's structural type. Lyrics are auto-split into sections on blank
 * lines; the type starts as a guess and is user-editable from the card header.
 */
export const SECTION_TYPES = [
  "verse",
  "chorus",
  "pre-chorus",
  "post-chorus",
  "bridge",
  "hook",
  "refrain",
  "intro",
  "outro",
  "interlude",
  "stanza",
  "other",
] as const;
export type SectionType = (typeof SECTION_TYPES)[number];

const SECTION_TYPE_LABELS: Record<SectionType, string> = {
  verse: "Verse",
  chorus: "Chorus",
  "pre-chorus": "Pre-Chorus",
  "post-chorus": "Post-Chorus",
  bridge: "Bridge",
  hook: "Hook",
  refrain: "Refrain",
  intro: "Intro",
  outro: "Outro",
  interlude: "Interlude",
  stanza: "Stanza",
  other: "Other",
};

export function sectionTypeLabel(type: SectionType): string {
  return SECTION_TYPE_LABELS[type] ?? "Section";
}

export const SECTION_TYPE_OPTIONS = SECTION_TYPES.map((value) => ({
  value,
  label: SECTION_TYPE_LABELS[value],
}));

/** Default section type when nothing better is known (poems read as stanzas). */
export const DEFAULT_SECTION_TYPE: SectionType = "verse";

/* ------------------------------------------------------------------ */
/* Analysis modes                                                      */
/* ------------------------------------------------------------------ */

/**
 * The analytical lenses. Each is a separate layer of annotations over the same
 * lyrics — a single word can carry one of each at once (a rhyme group *and* a
 * theme *and* a device). `read` is the plain reading view and stores nothing.
 */
export const ANNOTATION_MODES = [
  "rhyme-scheme",
  "rhyme-type",
  "sound",
  "theme",
  "device",
  "note",
] as const;
export type AnnotationMode = (typeof ANNOTATION_MODES)[number];

/** Every mode shown in the mode bar, including the read-only `read` view. */
export const VIEW_MODES = ["read", ...ANNOTATION_MODES] as const;
export type ViewMode = (typeof VIEW_MODES)[number];

/** How rhyme groups are drawn over the lyrics: tinted words, or A/B/C letters. */
export const RHYME_VIEWS = ["colours", "letters"] as const;
export type RhymeView = (typeof RHYME_VIEWS)[number];

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
  "rhyme-type": {
    mode: "rhyme-type",
    label: "Rhyme types",
    color: "#2FB9A0",
    helper: "Select a word and label how it rhymes — perfect, slant, internal, and so on.",
  },
  sound: {
    mode: "sound",
    label: "Sounds",
    color: "#4C8DF0",
    helper: "Mark sonic devices — alliteration, assonance, consonance, sibilance.",
  },
  theme: {
    mode: "theme",
    label: "Theme",
    color: "#8B6DF0",
    helper: "Tag words and phrases with the themes and imagery they carry.",
  },
  device: {
    mode: "device",
    label: "Device",
    color: "#F0973C",
    helper: "Mark literary devices — metaphor, simile, personification, and more.",
  },
  note: {
    mode: "note",
    label: "Note",
    color: "#C9922E",
    helper: "Write a free-form note about any word or phrase.",
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

/* ------------------------------------------------------------------ */
/* Value vocabularies for the other modes                              */
/* ------------------------------------------------------------------ */

/** Preset options a picker offers; the value stored is the `value` string. */
export interface Option {
  value: string;
  label: string;
}

export const RHYME_TYPE_OPTIONS: Option[] = [
  { value: "perfect", label: "Perfect" },
  { value: "slant", label: "Slant / Near" },
  { value: "internal", label: "Internal" },
  { value: "multisyllabic", label: "Multisyllabic" },
  { value: "eye", label: "Eye" },
  { value: "identical", label: "Identical" },
  { value: "assonant", label: "Assonant" },
  { value: "consonant", label: "Consonant" },
  { value: "forced", label: "Forced" },
];

export const SOUND_OPTIONS: Option[] = [
  { value: "alliteration", label: "Alliteration" },
  { value: "assonance", label: "Assonance" },
  { value: "consonance", label: "Consonance" },
  { value: "sibilance", label: "Sibilance" },
  { value: "onomatopoeia", label: "Onomatopoeia" },
];

export const DEVICE_OPTIONS: Option[] = [
  { value: "metaphor", label: "Metaphor" },
  { value: "simile", label: "Simile" },
  { value: "personification", label: "Personification" },
  { value: "imagery", label: "Imagery" },
  { value: "hyperbole", label: "Hyperbole" },
  { value: "enjambment", label: "Enjambment" },
  { value: "repetition", label: "Repetition" },
  { value: "anaphora", label: "Anaphora" },
  { value: "allusion", label: "Allusion" },
  { value: "symbolism", label: "Symbolism" },
  { value: "irony", label: "Irony" },
  { value: "oxymoron", label: "Oxymoron" },
  { value: "wordplay", label: "Wordplay" },
];

/** Options a mode's value-picker offers, or `null` for free-text/no-value modes. */
export function optionsForMode(mode: AnnotationMode): Option[] | null {
  switch (mode) {
    case "rhyme-type":
      return RHYME_TYPE_OPTIONS;
    case "sound":
      return SOUND_OPTIONS;
    case "device":
      return DEVICE_OPTIONS;
    default:
      return null;
  }
}

export function labelForValue(mode: AnnotationMode, value: string): string {
  const opts = optionsForMode(mode);
  return opts?.find((o) => o.value === value)?.label ?? value;
}

/* ------------------------------------------------------------------ */
/* Theme colours                                                       */
/* ------------------------------------------------------------------ */

/**
 * Themes are free-named, so a name is mapped to a stable colour from this
 * rotating palette (same name → same colour, every render). Distinct from the
 * rhyme palette so the two layers never read as the same encoding.
 */
export const THEME_PALETTE = [
  "#8B6DF0",
  "#4C8DF0",
  "#2FB9A0",
  "#EC5C79",
  "#F0973C",
  "#6FB63C",
  "#C77DFF",
  "#E06C9F",
] as const;

/** Deterministic name → palette colour. */
export function themeColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(hash) % THEME_PALETTE.length;
  return THEME_PALETTE[idx]!;
}
