import { Fragment, type ReactNode } from "react";
import { Flex, Grid, Text } from "@saintly-software/baritone";
import { Eyebrow } from "#/components/Eyebrow";
import type { EntryLine, EntrySection, LyricEntrySectionType } from "@rhymelab/api-contract";

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
  type,
  lines,
  renderLine,
  renderGutter,
}: EntrySection & Pick<LyricSectionsProps, "renderLine" | "renderGutter">) {
  return (
    <Flex direction="column" gap="1">
      <Eyebrow>{SECTION_TYPE_LABEL[type]}</Eyebrow>
      <Grid columns="2ch minmax(0, 1fr)" align="baseline">
        {lines.map((line) => (
          <Fragment key={line.index}>
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

export interface LyricSectionsProps {
  sections: readonly EntrySection[];
  renderLine: (line: EntryLine) => ReactNode;
  /** Content beside each line, in a fixed-width column. Omitted, the column stays empty. */
  renderGutter?: (line: EntryLine) => ReactNode;
}
