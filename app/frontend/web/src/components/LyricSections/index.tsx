import { Fragment, type ReactNode } from "react";
import { Flex, Text } from "@saintly-software/baritone";
import { splitSections, type EntryDetail, type SectionType } from "@rhymelab/api-contract";
import { Eyebrow } from "#/components/Eyebrow";

const SECTION_TYPE_LABEL: Record<SectionType, string> = {
  intro: "Intro",
  verse: "Verse",
  prechorus: "Pre-Chorus",
  chorus: "Chorus",
  bridge: "Bridge",
  outro: "Outro",
};

/**
 * A piece laid out as labelled blocks, one per section. How a line itself renders
 * is the caller's call, handed in as `renderLine`, so the layout looks the same
 * whether the piece is being read or edited.
 */
export function LyricSections({ sections, renderLine }: LyricSectionsProps) {
  return (
    <Flex direction="column" gap="6">
      {sections.map((section, index) => (
        <LyricSection key={index} {...section} renderLine={renderLine} />
      ))}
    </Flex>
  );
}

function LyricSection({
  label,
  lines,
  renderLine,
}: SheetSection & Pick<LyricSectionsProps, "renderLine">) {
  return (
    <Flex direction="column" gap="1">
      <Eyebrow>{SECTION_TYPE_LABEL[label]}</Eyebrow>
      <Text whiteSpace="pre-wrap" lineHeight="lyric">
        {lines.map((line, i) => (
          <Fragment key={i}>
            {i > 0 && "\n"}
            {renderLine(line)}
          </Fragment>
        ))}
      </Text>
    </Flex>
  );
}

/** A line of the sheet: its text, plus the index it holds in the whole piece. */
export type SheetLine = { text: string; globalIndex: number };

/** One section of the sheet: its type, and the lines it holds in order. */
export type SheetSection = { label: SectionType; lines: readonly SheetLine[] };

export interface LyricSectionsProps {
  sections: readonly SheetSection[];
  renderLine: (line: SheetLine) => ReactNode;
}

/**
 * Split a piece's body into the sections it renders as, each line carrying the
 * index it holds in the whole piece — the coordinate space annotations are
 * authored in.
 */
export function toSheetSections(
  entry: Pick<EntryDetail, "body" | "structure">,
): readonly SheetSection[] {
  // The body is normalized, so `splitSections` round-trips it and sections are
  // separated by exactly one blank line — hence `+ 1` per section to skip that
  // separator. `structure` is kept exactly one label per section by the API, so
  // the two align index-for-index.
  let cursor = 0;
  return splitSections(entry.body).map((section, index) => {
    const lines = section.split("\n").map((text, i) => ({ text, globalIndex: cursor + i }));
    cursor += lines.length + 1;
    return { label: entry.structure[index], lines };
  });
}
