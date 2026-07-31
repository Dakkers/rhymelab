import type { MouseEvent, ReactNode } from "react";
import { Badge, Button, Checkbox, Flex, Select, Text } from "@saintly-software/baritone";
import { Eyebrow } from "#/components/Eyebrow";
import {
  RHYME_GROUP_COLORS,
  SECTION_TYPE_OPTIONS,
  type RhymeGroup,
  type RhymeView,
  type SectionType,
  type ViewMode,
} from "@rhymelab/core";
import type { LineToken, WordToken } from "@rhymelab/core";
import type { AnnotationDTO, SectionDTO } from "@rhymelab/api-contract";
import { colorForAnnotation, type LineSelection, type Selection } from "./logic";

interface SectionCardProps {
  section: SectionDTO;
  lines: LineToken[];
  mode: ViewMode;
  view: RhymeView;
  selection: Selection | null;
  lineSelection: LineSelection | null;
  editing: boolean;
  busy: boolean;
  findCurrent: (start: number, end: number) => AnnotationDTO | null;
  findRhyme: (start: number, end: number) => AnnotationDTO | null;
  onSelectWord: (word: WordToken, shiftKey: boolean) => void;
  onSelectLine: (line: LineToken, section: SectionDTO, e: { shiftKey: boolean }) => void;
  onSelectAllLines: (section: SectionDTO) => void;
  onChangeType: (type: SectionType) => void;
}

export function SectionCard(props: SectionCardProps) {
  const { section, lines, mode, editing } = props;
  const rhyme = mode === "rhyme-scheme";
  // Only the word-level modes make individual words interactive; line mode and
  // read mode leave them inert, so they don't get the `.rl-word` cursor/hover.
  const wordAnnotate = mode !== "read" && !rhyme;

  return (
    <section className="rl-section-card" data-editing={editing ? "true" : undefined}>
      <header className="rl-section-head">
        <span className="rl-section-label">
          <Eyebrow as="span" saliency="mid">
            {section.label}
          </Eyebrow>
          {editing && (
            <Badge shape="square" size="sm" intent="primary" saliency="high" text="Editing" />
          )}
        </span>
        <Flex inline align="center" gap="3" render={<span />}>
          {mode === "rhyme-scheme" && (
            <Button
              appearance="text"
              variant="sm"
              intent="primary"
              onClick={() => props.onSelectAllLines(section)}
              disabled={props.busy}
            >
              Select all lines
            </Button>
          )}
          <Select
            label="Type"
            labelPosition="start"
            options={SECTION_TYPE_OPTIONS}
            value={section.type}
            onChange={(v) => v && props.onChangeType(v as SectionType)}
            size="sm"
            disabled={props.busy}
          />
        </Flex>
      </header>

      {/* The lyric body itself: serif, one size up from body copy, and set loose
          enough that the per-line rhyme badges have room to sit beside it. */}
      <Text
        font="serif"
        size="xl"
        className={wordAnnotate ? "rl-annotate" : undefined}
        style={{ lineHeight: 1.85 }}
      >
        {rhyme ? (
          // Group the section's line-checkboxes and name the group by the section,
          // so assistive tech announces "Verse 1, group" around the set.
          <div role="group" aria-label={section.label}>
            {lines.map((line) => (
              <Line key={line.index} line={line} {...props} />
            ))}
          </div>
        ) : (
          lines.map((line) => <Line key={line.index} line={line} {...props} />)
        )}
      </Text>
    </section>
  );
}

function Line(props: SectionCardProps & { line: LineToken }) {
  const { line, section, mode, view } = props;

  // Rhyme scheme is line-level: a Baritone Checkbox owns the selection (role,
  // keyboard, focus), and the whole row is a click target around it — click
  // anywhere on the line to tick it. The assigned group letter sits on the right
  // and (in "colours" view) a tint runs across the line. Words still render as
  // spans so the text reads normally, but they don't handle clicks; the row does.
  if (mode === "rhyme-scheme") {
    if (line.blank) return <div className="rl-line rl-line--blank" />;
    const ann = props.findRhyme(line.start, line.end);
    const color = ann?.value ? colorForAnnotation(ann) : null;
    const tint = color && view === "colours" ? color.tint : undefined;
    const selected = props.lineSelection?.lines.some((l) => l.index === line.index) ?? false;

    return (
      <div
        className="rl-line rl-line--rhyme"
        data-line-selected={selected ? "true" : undefined}
        style={tint ? { background: tint } : undefined}
        onClick={(e) => props.onSelectLine(line, section, e)}
      >
        {/* The lyric IS the checkbox's label, so the box is named by the visible
            line (no duplicate string) and the text is part of the native toggle
            target. The wrapper stops the box/label click from bubbling so the row
            handler doesn't double-toggle it; the row still makes the surrounding
            space clickable. */}
        <span className="rl-line-check" onClick={(e) => e.stopPropagation()}>
          <Checkbox
            size="sm"
            value={selected}
            slotProps={{ label: { className: "rl-line-label" } }}
            label={line.text.trim()}
            onChange={(_value, event) =>
              props.onSelectLine(line, section, event as unknown as { shiftKey: boolean })
            }
          />
        </span>
        <LineBadge line={line} view={view} findRhyme={props.findRhyme} />
      </div>
    );
  }

  return <div className="rl-line">{renderSegments(line, props)}</div>;
}

/**
 * Rebuild the line from its text, wrapping each word in a selectable span (the
 * word-level annotation modes; line mode labels its checkbox with the line text
 * instead and never calls this).
 */
function renderSegments(line: LineToken, props: SectionCardProps) {
  const { mode, selection } = props;
  const annotate = mode !== "read";
  const nodes: ReactNode[] = [];
  let cursor = 0;

  const inSelection = (w: WordToken) =>
    selection != null && w.start >= selection.start && w.end <= selection.end;

  line.words.forEach((word, i) => {
    const localStart = word.start - line.start;
    const localEnd = word.end - line.start;

    if (localStart > cursor) {
      nodes.push(<span key={`s${i}`}>{line.text.slice(cursor, localStart)}</span>);
    }

    const ann = annotate ? props.findCurrent(word.start, word.end) : null;
    const color = ann ? colorForAnnotation(ann) : null;

    nodes.push(
      <span
        key={`w${i}`}
        className="rl-word"
        data-annot={color ? "true" : undefined}
        data-selected={inSelection(word) ? "true" : undefined}
        style={color ? { background: color.tint, color: color.ink } : undefined}
        onClick={
          annotate
            ? (e: MouseEvent) => {
                e.stopPropagation();
                props.onSelectWord(word, e.shiftKey);
              }
            : undefined
        }
      >
        {word.text}
      </span>,
    );
    cursor = localEnd;
  });

  if (cursor < line.text.length) {
    nodes.push(<span key="tail">{line.text.slice(cursor)}</span>);
  }
  return nodes;
}

/** The group letter shown at a line's right edge — display only; the row (a
 *  checkbox) owns selection, so there's no "+" affordance here anymore. */
function LineBadge({
  line,
  view,
  findRhyme,
}: {
  line: LineToken;
  view: RhymeView;
  findRhyme: (start: number, end: number) => AnnotationDTO | null;
}) {
  const ann = findRhyme(line.start, line.end);
  if (!ann || !ann.value) return null;

  const g = ann.value as RhymeGroup;
  const c = RHYME_GROUP_COLORS[g] ?? RHYME_GROUP_COLORS.X;
  // In "letters" view keep the badge neutral-ink so the scheme reads as letters.
  const bg = view === "letters" ? "transparent" : c.solid;
  const fg = view === "letters" ? "var(--rl-ink)" : c.ink;
  const border = view === "letters" ? "1px solid var(--rl-hairline-strong)" : "none";

  return (
    <span
      className="rl-line-badge"
      role="img"
      aria-label={`Rhyme group ${g}`}
      style={{ background: bg, color: fg, border }}
    >
      <Text as="span" size="sm" weight="superbold" style={{ color: "inherit", lineHeight: 1 }}>
        {g}
      </Text>
    </span>
  );
}
