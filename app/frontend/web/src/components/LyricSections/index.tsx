import { Fragment, type ReactNode } from "react";
import { Flex, Grid, Text } from "@saintly-software/baritone";
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
  stanza: "Stanza",
  postchorus: "Post-Chorus",
  refrain: "Refrain",
  interlude: "Interlude",
};

export function LyricSections({ sections, renderLine, renderGutter }: LyricSectionsProps) {
  return (
    <Flex direction="column" gap="6">
      {sections.map((section, index) => (
        <LyricSection
          key={index}
          {...section}
          renderLine={renderLine}
          renderGutter={renderGutter}
        />
      ))}
    </Flex>
  );
}

function LyricSection({
  label,
  lines,
  renderLine,
  renderGutter,
}: SheetSection & Pick<LyricSectionsProps, "renderLine" | "renderGutter">) {
  return (
    <Flex direction="column" gap="1">
      <Eyebrow>{SECTION_TYPE_LABEL[label]}</Eyebrow>
      <Grid columns="2ch minmax(0, 1fr)" align="baseline">
        {lines.map((line) => (
          <Fragment key={line.globalIndex}>
            <Text font="mono" size="sm" saliency="low" textAlign="end">
              {renderGutter?.(line)}
            </Text>
            <Text whiteSpace="pre-wrap" lineHeight="lyric" pl="3">
              {renderLine(line)}
            </Text>
          </Fragment>
        ))}
      </Grid>
    </Flex>
  );
}

export type SheetLine = { text: string; globalIndex: number };

export type SheetSection = { label: LyricEntrySectionType; lines: readonly SheetLine[] };

export interface LyricSectionsProps {
  sections: readonly SheetSection[];
  renderLine: (line: SheetLine) => ReactNode;
  /** Content beside each line, in a fixed-width column. Omitted, the column stays empty. */
  renderGutter?: (line: SheetLine) => ReactNode;
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
