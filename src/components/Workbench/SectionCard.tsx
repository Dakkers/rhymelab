import type { MouseEvent, ReactNode } from "react";
import { Select } from "@saintly-software/baritone";
import {
  RHYME_GROUP_COLORS,
  SECTION_TYPE_OPTIONS,
  type RhymeGroup,
  type RhymeView,
  type SectionType,
  type ViewMode,
} from "#/lib/constants";
import { finalWord, type LineToken, type WordToken } from "#/lib/lyrics";
import type { AnnotationDTO, SectionDTO } from "#/server/entries";
import { colorForAnnotation, type Selection } from "./logic";

interface SectionCardProps {
  section: SectionDTO;
  lines: LineToken[];
  mode: ViewMode;
  view: RhymeView;
  selection: Selection | null;
  editing: boolean;
  busy: boolean;
  findCurrent: (start: number, end: number) => AnnotationDTO | null;
  findRhyme: (start: number, end: number) => AnnotationDTO | null;
  onSelectWord: (word: WordToken, shiftKey: boolean) => void;
  onSelectFinalWord: (line: LineToken) => void;
  onChangeType: (type: SectionType) => void;
}

export function SectionCard(props: SectionCardProps) {
  const { section, lines, mode, editing } = props;
  const annotate = mode !== "read";

  return (
    <section className="rl-section-card" data-editing={editing ? "true" : undefined}>
      <header className="rl-section-head">
        <span className="rl-section-label">
          {section.label}
          {editing && <span className="rl-editing-badge">Editing</span>}
        </span>
        <span className="rl-section-type">
          <span className="label">Type</span>
          <Select
            options={SECTION_TYPE_OPTIONS}
            value={section.type}
            onChange={(v) => v && props.onChangeType(v as SectionType)}
            size="sm"
            disabled={props.busy}
            aria-label={`Section type for ${section.label}`}
          />
        </span>
      </header>

      <div className={`rl-lyrics${annotate ? " rl-annotate" : ""}`}>
        {lines.map((line) => (
          <Line key={line.index} line={line} {...props} />
        ))}
      </div>
    </section>
  );
}

function Line(props: SectionCardProps & { line: LineToken }) {
  const { line, mode, view } = props;
  const last = finalWord(line);

  return (
    <div className="rl-line">
      {renderSegments(line, props)}
      {mode === "rhyme-structure" && last && (
        <LineBadge
          word={last}
          view={view}
          findRhyme={props.findRhyme}
          onClick={() => props.onSelectFinalWord(line)}
        />
      )}
    </div>
  );
}

/** Rebuild the line from its text, wrapping each word in a selectable span. */
function renderSegments(line: LineToken, props: SectionCardProps) {
  const { mode, view, selection } = props;
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
    // In rhyme "letters" view the words aren't tinted — the badges carry the scheme.
    const showTint = color && !(mode === "rhyme-structure" && view === "letters");

    nodes.push(
      <span
        key={`w${i}`}
        className="rl-word"
        data-annot={showTint ? "true" : undefined}
        data-selected={inSelection(word) ? "true" : undefined}
        style={showTint ? { background: color!.tint, color: color!.ink } : undefined}
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

function LineBadge({
  word,
  view,
  findRhyme,
  onClick,
}: {
  word: WordToken;
  view: RhymeView;
  findRhyme: (start: number, end: number) => AnnotationDTO | null;
  onClick: () => void;
}) {
  const ann = findRhyme(word.start, word.end);
  if (!ann || !ann.value) {
    return (
      <button
        type="button"
        className="rl-line-badge rl-line-badge--add"
        onClick={onClick}
        aria-label="Assign rhyme group to this line"
      >
        +
      </button>
    );
  }
  const g = ann.value as RhymeGroup;
  const c = RHYME_GROUP_COLORS[g] ?? RHYME_GROUP_COLORS.X;
  // In "letters" view keep the badge neutral-ink so the scheme reads as letters.
  const bg = view === "letters" ? "transparent" : c.solid;
  const fg = view === "letters" ? "var(--rl-ink)" : c.ink;
  const border = view === "letters" ? "1px solid var(--rl-hairline-strong)" : "none";

  return (
    <button
      type="button"
      className="rl-line-badge"
      style={{ background: bg, color: fg, border }}
      onClick={onClick}
      aria-label={`Rhyme group ${g}`}
    >
      {g}
    </button>
  );
}
