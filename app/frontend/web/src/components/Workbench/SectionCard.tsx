import { useState } from "react";
import { Badge, Button, Checkbox, Flex, Text } from "@saintly-software/baritone";
import { Eyebrow } from "#/components/Eyebrow";
import { RHYME_GROUP_COLORS, type RhymeView } from "@rhymelab/core";
import type { LineToken } from "@rhymelab/core";
import type { EntryDetail, SectionDTO } from "@rhymelab/api-contract";
import {
  annotatableLines,
  colorForAnnotation,
  duplicateInfo,
  type LineSelection,
  type RhymeFinder,
} from "./logic";

interface SectionCardProps {
  entry: EntryDetail;
  section: SectionDTO;
  lines: LineToken[];
  view: RhymeView;
  lineSelection: LineSelection | null;
  editing: boolean;
  busy: boolean;
  findRhyme: RhymeFinder;
  onSelectLine: (
    line: LineToken,
    lineInSection: number,
    section: SectionDTO,
    e: { shiftKey: boolean },
  ) => void;
  onSelectAllLines: (section: SectionDTO) => void;
  onUnlink: (sectionId: number) => void;
  onRelink: (sectionId: number) => void;
}

export function SectionCard(props: SectionCardProps) {
  const { entry, section, lines, editing } = props;
  const dup = duplicateInfo(entry, section);
  const rows = annotatableLines(lines);

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
        <Button
          appearance="text"
          variant="sm"
          intent="primary"
          onClick={() => props.onSelectAllLines(section)}
          disabled={props.busy}
        >
          Select all lines
        </Button>
      </header>

      <LinkAffordance {...props} dup={dup} />

      {/* The lyric body itself: serif, one size up from body copy, and set loose
          enough that the per-line badges have room to sit beside it. Each line is
          a selectable checkbox row; grouping them and naming the group by the
          section makes assistive tech announce "Section 1, group" around the set. */}
      <Text font="serif" size="xl" lineHeight="lyric">
        <div role="group" aria-label={section.label}>
          {lines.map((line) => {
            if (line.blank) return <div key={line.index} className="rl-line rl-line--blank" />;
            const lineInSection = rows.find((r) => r.line.index === line.index)!.lineInSection;
            return <Line key={line.index} line={line} lineInSection={lineInSection} {...props} />;
          })}
        </div>
      </Text>
    </section>
  );
}

/**
 * The duplicate-link affordance (P13): a linked copy renders the canonical's rows
 * and can be unlinked to annotate on its own; a user-unlinked copy with a shareable
 * peer can be relinked (which deletes its own rows — confirmed first).
 */
function LinkAffordance({
  section,
  dup,
  busy,
  onUnlink,
  onRelink,
}: SectionCardProps & { dup: ReturnType<typeof duplicateInfo> }) {
  const [confirmRelink, setConfirmRelink] = useState(false);

  if (dup.linked) {
    return (
      <Flex align="center" gap="3" wrap mb="2" className="rl-section-link">
        <Badge shape="round" size="sm" intent="primary" saliency="low" text="Linked" />
        <Text size="sm" saliency="low">
          Edits apply to all {dup.copyCount} copies.
        </Text>
        <Button
          appearance="text"
          variant="sm"
          intent="primary"
          onClick={() => onUnlink(section.id)}
          disabled={busy}
        >
          Annotate separately
        </Button>
      </Flex>
    );
  }

  if (dup.unlinkedWithPeer) {
    return (
      <Flex align="center" gap="3" wrap mb="2" className="rl-section-link">
        <Badge shape="round" size="sm" intent="neutral" saliency="low" text="Separate" />
        {confirmRelink ? (
          <>
            <Text size="sm" saliency="low">
              Relink and delete this copy's own marks?
            </Text>
            <Button
              appearance="text"
              variant="sm"
              intent="negative"
              onClick={() => onRelink(section.id)}
              disabled={busy}
            >
              Relink
            </Button>
            <Button
              appearance="text"
              variant="sm"
              intent="neutral"
              saliency="low"
              onClick={() => setConfirmRelink(false)}
              disabled={busy}
            >
              Cancel
            </Button>
          </>
        ) : (
          <Button
            appearance="text"
            variant="sm"
            intent="primary"
            onClick={() => setConfirmRelink(true)}
            disabled={busy}
          >
            Relink to the shared copy
          </Button>
        )}
      </Flex>
    );
  }

  if (dup.isCanonical) {
    return (
      <Flex align="center" gap="2" mb="2" className="rl-section-link">
        <Badge shape="round" size="sm" intent="primary" saliency="low" text="Shared" />
        <Text size="sm" saliency="low">
          {dup.copyCount} copies share these annotations.
        </Text>
      </Flex>
    );
  }

  return null;
}

/**
 * One selectable rhyme-scheme row: a Baritone Checkbox owns the selection (role,
 * keyboard, focus) and the whole row is a click target around it — click anywhere
 * on the line to tick it. An assigned rhyme group tints the row (in "colours"
 * view) and marks it at the right edge with the group letter.
 */
function Line(props: SectionCardProps & { line: LineToken; lineInSection: number }) {
  const { line, lineInSection, section, view } = props;

  const ann = props.findRhyme(section.id, lineInSection);
  const color = ann ? colorForAnnotation(ann) : null;
  // Rhyme scheme paints its tint only in "colours" view (the letters view keeps
  // the lyrics plain).
  const tint = color && view === "colours" ? color.tint : undefined;
  const selected = props.lineSelection?.lines.some((l) => l.index === line.index) ?? false;

  return (
    <div
      className="rl-line rl-line--select"
      data-line-selected={selected ? "true" : undefined}
      style={tint ? { background: tint } : undefined}
      onClick={(e) => props.onSelectLine(line, lineInSection, section, e)}
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
            props.onSelectLine(
              line,
              lineInSection,
              section,
              event as unknown as { shiftKey: boolean },
            )
          }
        />
      </span>
      {ann && <LineBadge group={ann.value} view={view} />}
    </div>
  );
}

/** The group letter shown at a rhyme line's right edge — display only; the row (a
 *  checkbox) owns selection. */
function LineBadge({ group, view }: { group: string; view: RhymeView }) {
  const c = RHYME_GROUP_COLORS[group as keyof typeof RHYME_GROUP_COLORS] ?? RHYME_GROUP_COLORS.X;
  // In "letters" view keep the badge neutral-ink so the scheme reads as letters.
  const bg = view === "letters" ? "transparent" : c.solid;
  const fg = view === "letters" ? "var(--rl-ink)" : c.ink;
  const border = view === "letters" ? "1px solid var(--rl-hairline-strong)" : "none";

  return (
    <span
      className="rl-line-badge"
      role="img"
      aria-label={`Rhyme group ${group}`}
      style={{ background: bg, color: fg, border }}
    >
      <Text as="span" size="sm" weight="superbold" lineHeight="none" style={{ color: "inherit" }}>
        {group}
      </Text>
    </span>
  );
}
