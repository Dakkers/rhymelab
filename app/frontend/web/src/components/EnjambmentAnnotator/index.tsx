import { useMemo } from "react";
import { useForm } from "@tanstack/react-form";
import { Button, Card, Flex, Text } from "@saintly-software/baritone";
import { splitSections, type EntryDetail, type SectionType } from "@rhymelab/api-contract";
import { Eyebrow } from "#/components/Eyebrow";

const KIND_LABEL: Record<EntryDetail["kind"], string> = {
  lyrics: "Lyrics",
  poem: "Poem",
};

/**
 * Display labels for the closed set of section types — the raw values are lower-
 * case slugs (`prechorus`), so this is where they get their human casing and the
 * hyphen a reader expects.
 */
const SECTION_TYPE_LABEL: Record<SectionType, string> = {
  intro: "Intro",
  verse: "Verse",
  prechorus: "Pre-Chorus",
  chorus: "Chorus",
  bridge: "Bridge",
  outro: "Outro",
};

/** One rendered line, carrying the global index its enjambment mark is keyed by. */
interface Line {
  /** Position across the whole piece, 0-based — the index into `enjambed`. */
  index: number;
  text: string;
}

/** A section's lines, grouped so each block keeps its own structure label. */
interface Section {
  /** Index into `entry.structure`, so the block can show its section label. */
  structureIndex: number;
  lines: Line[];
}

/**
 * Split `body` into sections of lines, numbering the lines with one running
 * index across the whole piece. That global index — not a per-section one — is
 * what an enjambment mark is stored against: enjambment is a property of the
 * break between line N and line N+1, so a single sequence over the whole piece is
 * the natural key, and it's what makes "the very last line can't run on" a single
 * comparison rather than a per-section edge case.
 */
function toSections(body: string): { sections: Section[]; lineCount: number } {
  let index = 0;
  const sections = splitSections(body).map((section, structureIndex) => ({
    structureIndex,
    lines: section.split("\n").map((text) => ({ index: index++, text })),
  }));
  return { sections, lineCount: index };
}

/**
 * Split a line into its inert lead and its clickable end — everything up to the
 * last word (whitespace kept, so the rendered lead is byte-for-byte the original)
 * and the last word itself. A single-word line has no lead. Lines arrive already
 * trimmed (`normalizeEntryBody`), so the `trimEnd` is only defensive.
 */
function splitLineEnd(text: string): { lead: string; last: string } {
  const trimmed = text.trimEnd();
  // Greedy `.*\S` swallows everything through the second-to-last word, so the
  // final group is the last word and the middle group is exactly the gap before
  // it — `lead + last` reconstructs the line unchanged.
  const match = /^(.*\S)(\s+)(\S+)$/.exec(trimmed);
  if (!match) return { lead: "", last: trimmed };
  return { lead: match[1] + match[2], last: match[3] };
}

/**
 * The enjambment annotator: the piece's text, laid out one line per row with the
 * *end* of each line a click target for "this line runs on into the next." Marks
 * live in a TanStack Form (`enjambed[i]` ⇔ line `i` runs on) rather than local
 * state, so a single `form.store` selector answers "are there unsaved marks?" —
 * the check a mode switch will read before it discards them. The last line of the
 * piece has nothing to run on into, so it's rendered as plain text.
 *
 * Persistence isn't wired yet — there's no annotation storage schema — so the
 * form's defaults are all-unmarked and `Reset` (not a `Save`) is the only action.
 * When storage lands, the defaults seed from the loaded marks and `onSubmit`
 * persists them; the interaction here doesn't change.
 *
 * The caller keys this on `entry.body`, so an edit that changes the lines remounts
 * it and the form re-seeds against the new line count — old marks, keyed by a now-
 * stale index, don't carry over.
 */
export function EnjambmentAnnotator({ entry }: EnjambmentAnnotatorProps) {
  const { sections, lineCount } = useMemo(() => toSections(entry.body), [entry.body]);
  const lastLineIndex = lineCount - 1;

  const form = useForm({
    defaultValues: { enjambed: Array.from({ length: lineCount }, () => false) },
  });

  const toggle = (index: number) => {
    void form.setFieldValue("enjambed", (marks) => marks.map((on, i) => (i === index ? !on : on)));
  };

  return (
    <Card
      header={
        <Card.Header title={KIND_LABEL[entry.kind]}>
          <form.Subscribe selector={(state) => state.isDefaultValue}>
            {(isDefaultValue) => (
              <Flex align="center" gap="3">
                {!isDefaultValue && (
                  <Text size="xs" weight="semibold" intent="primary">
                    Unsaved marks
                  </Text>
                )}
                <Button saliency="low" disabled={isDefaultValue} onClick={() => form.reset()}>
                  Reset
                </Button>
              </Flex>
            )}
          </form.Subscribe>
        </Card.Header>
      }
      description={
        <Text size="sm" saliency="low">
          Click the end of a line to mark enjambment — where it runs on into the next line without a
          pause.
        </Text>
      }
    >
      <form.Subscribe selector={(state) => state.values.enjambed}>
        {(enjambed) => (
          <Flex direction="column" gap="6">
            {sections.map((section) => (
              <Flex key={section.structureIndex} direction="column" gap="1">
                <Eyebrow>{SECTION_TYPE_LABEL[entry.structure[section.structureIndex]]}</Eyebrow>
                {section.lines.map((line) => (
                  <LineRow
                    key={line.index}
                    line={line}
                    enjambed={enjambed[line.index] ?? false}
                    selectable={line.index !== lastLineIndex}
                    onToggle={toggle}
                  />
                ))}
              </Flex>
            ))}
          </Flex>
        )}
      </form.Subscribe>
    </Card>
  );
}

/**
 * A single line. The lead words are inert; the last word is the click target
 * (unless this is the last line of the piece, which can't run on into anything
 * and so renders as plain text). Its `data-enjambed` drives the CSS marked state
 * and `aria-pressed` announces the same toggle to assistive tech.
 */
function LineRow({ line, enjambed, selectable, onToggle }: LineRowProps) {
  const { lead, last } = splitLineEnd(line.text);

  return (
    <Text as="div" lineHeight="lyric" className="rl-eline">
      {lead}
      {selectable ? (
        <button
          type="button"
          className="rl-eline-end"
          data-enjambed={enjambed || undefined}
          aria-pressed={enjambed}
          // Both states keep the "running on into the next line" phrase so the
          // control has one stable accessible name to find it by, marked or not.
          aria-label={
            enjambed
              ? `Line ending “${last}”: running on into the next line — click to undo`
              : `Line ending “${last}”: mark as running on into the next line`
          }
          onClick={() => onToggle(line.index)}
        >
          {last}
        </button>
      ) : (
        last
      )}
    </Text>
  );
}

export interface EnjambmentAnnotatorProps {
  entry: EntryDetail;
}

interface LineRowProps {
  line: Line;
  enjambed: boolean;
  /** False for the last line of the piece — it has no following line to run on into. */
  selectable: boolean;
  onToggle: (index: number) => void;
}
