import { Fragment, type ReactNode } from "react";
import { Flex, Text } from "@saintly-software/baritone";
import { Eyebrow } from "#/components/Eyebrow";
import {
  splitSections,
  type LyricEntrySectionType,
  type ReadLyricEntryDetail,
} from "@rhymelab/api-contract";

const SECTION_TYPE_LABEL: Record<LyricEntrySectionType, string> = {
  intro: "Intro",
  verse: "Verse",
  prechorus: "Pre-Chorus",
  chorus: "Chorus",
  bridge: "Bridge",
  outro: "Outro",
};

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

export type SheetLine = { text: string; globalIndex: number };

export type SheetSection = { label: LyricEntrySectionType; lines: readonly SheetLine[] };

export interface LyricSectionsProps {
  sections: readonly SheetSection[];
  renderLine: (line: SheetLine) => ReactNode;
}

export function toSheetSections(
  entry: Pick<ReadLyricEntryDetail, "body" | "structure">,
): readonly SheetSection[] {
  let cursor = 0;
  return splitSections(entry.body).map((section, index) => {
    const lines = section.split("\n").map((text, i) => ({ text, globalIndex: cursor + i }));
    cursor += lines.length + 1;
    return { label: entry.structure[index], lines };
  });
}
