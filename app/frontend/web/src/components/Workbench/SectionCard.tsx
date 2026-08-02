import { Badge, Button, Checkbox, Text } from "@saintly-software/baritone";
import { Eyebrow } from "#/components/Eyebrow";
import { RHYME_GROUP_COLORS, type RhymeGroup, type RhymeView, type ViewMode } from "@rhymelab/core";
import type { LineToken } from "@rhymelab/core";
import type { AnnotationDTO, SectionDTO } from "@rhymelab/api-contract";
import { colorForAnnotation, type LineSelection } from "./logic";

interface SectionCardProps {
  section: SectionDTO;
  lines: LineToken[];
  mode: ViewMode;
  view: RhymeView;
  lineSelection: LineSelection | null;
  editing: boolean;
  busy: boolean;
  findRhyme: (start: number, end: number) => AnnotationDTO | null;
  onSelectLine: (line: LineToken, section: SectionDTO, e: { shiftKey: boolean }) => void;
  onSelectAllLines: (section: SectionDTO) => void;
}

export function SectionCard(props: SectionCardProps) {
  const { section, lines, mode, editing } = props;
  // Every mode except the plain reading view annotates whole lines: the line is
  // the click target (a checkbox row) and, when tinted, the coloured band.
  const lineLevel = mode !== "read";

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
        {lineLevel && (
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
      </header>

      {/* The lyric body itself: serif, one size up from body copy, and set loose
          enough that the per-line badges have room to sit beside it. */}
      <Text font="serif" size="xl" lineHeight="lyric">
        {lineLevel ? (
          // Group the section's line-checkboxes and name the group by the section,
          // so assistive tech announces "Section 1, group" around the set.
          <div role="group" aria-label={section.label}>
            {lines.map((line) => (
              <Line key={line.index} line={line} {...props} />
            ))}
          </div>
        ) : (
          lines.map((line) => <ReadLine key={line.index} line={line} />)
        )}
      </Text>
    </section>
  );
}

/**
 * One selectable rhyme-scheme row: a Baritone Checkbox owns the selection (role,
 * keyboard, focus) and the whole row is a click target around it — click anywhere
 * on the line to tick it. An assigned rhyme group tints the row (in "colours"
 * view) and marks it at the right edge with the group letter.
 */
function Line(props: SectionCardProps & { line: LineToken }) {
  const { line, section, view } = props;

  if (line.blank) return <div className="rl-line rl-line--blank" />;

  const ann = props.findRhyme(line.start, line.end);
  const color = ann && ann.value ? colorForAnnotation(ann) : null;
  // Rhyme scheme paints its tint only in "colours" view (the letters view keeps
  // the lyrics plain).
  const tint = color && view === "colours" ? color.tint : undefined;
  const selected = props.lineSelection?.lines.some((l) => l.index === line.index) ?? false;

  return (
    <div
      className="rl-line rl-line--select"
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

/** A line in the plain reading view — no selection, no annotation. */
function ReadLine({ line }: { line: LineToken }) {
  if (line.blank) return <div className="rl-line rl-line--blank" />;
  return <div className="rl-line">{line.text}</div>;
}

/** The group letter shown at a rhyme line's right edge — display only; the row (a
 *  checkbox) owns selection. */
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
      <Text as="span" size="sm" weight="superbold" lineHeight="none" style={{ color: "inherit" }}>
        {g}
      </Text>
    </span>
  );
}
