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

const HIGHLIGHT_STYLE = {
  backgroundColor: "color-mix(in srgb, currentColor 10%, transparent)",
} as const;

export function LyricSections({
  sections,
  renderLine,
  renderGutter,
  highlightedLines,
}: LyricSectionsProps) {
  return (
    <Flex direction="column" gap="6">
      {sections.map((section, index) => (
        <LyricSection
          key={index}
          {...section}
          renderLine={renderLine}
          renderGutter={renderGutter}
          highlightedLines={highlightedLines}
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
  highlightedLines,
}: EntrySection & Pick<LyricSectionsProps, "renderLine" | "renderGutter" | "highlightedLines">) {
  return (
    <Flex direction="column" gap="1">
      <Eyebrow>{SECTION_TYPE_LABEL[type]}</Eyebrow>
      <Grid columns={renderGutter ? "2ch minmax(0, 1fr)" : "minmax(0, 1fr)"} align="baseline">
        {lines.map((line) => {
          const style = highlightedLines?.has(line.index) ? HIGHLIGHT_STYLE : undefined;
          return (
            <Fragment key={line.index}>
              {renderGutter && (
                <Text font="mono" size="sm" saliency="low" textAlign="end">
                  {renderGutter(line)}
                </Text>
              )}
              <Text whiteSpace="pre-wrap" lineHeight="lyric" pl={renderGutter ? "3" : undefined}>
                <span style={style}>{renderLine(line)}</span>
              </Text>
            </Fragment>
          );
        })}
      </Grid>
    </Flex>
  );
}

export interface LyricSectionsProps {
  sections: readonly EntrySection[];
  renderLine: (line: EntryLine) => ReactNode;
  /** Content beside each line, in a fixed-width column. Omitted, the column is not rendered. */
  renderGutter?: (line: EntryLine) => ReactNode;
  /** Song-wide `index` values of lines to tint. Only the background changes, so layout holds still. */
  highlightedLines?: ReadonlySet<number>;
}
