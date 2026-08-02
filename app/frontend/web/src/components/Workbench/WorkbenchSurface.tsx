import { useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link as RouterLink } from "@tanstack/react-router";
import { Box, Notice } from "@saintly-software/baritone";
import { type AnnotationMode, type LineToken, type RhymeView, type ViewMode } from "@rhymelab/core";
import type { EntryDetail, SectionDTO } from "@rhymelab/api-contract";
import { client } from "#/lib/orpc";
import { invalidateEntry } from "#/lib/queries";
import { Inspector } from "./Inspector";
import { SectionCard } from "./SectionCard";
import { deriveSections, makeWordFinder, type LineSelection, type LineSpan } from "./logic";

interface WorkbenchSurfaceProps {
  entry: EntryDetail;
  /** Which annotation layer is active. The picker that changes it lives in the
   *  page chrome (`header`); the surface just renders in the mode it's handed. */
  mode: ViewMode;
  /** How rhyme groups are drawn. */
  view: RhymeView;
  onViewChange: (view: RhymeView) => void;
  /** Page chrome rendered above the sections (title, mode bar, notices). The
   *  surface itself renders none of it, so a test can mount just the editing
   *  surface by leaving this out. */
  header?: ReactNode;
}

const toLineSpan = (l: LineToken): LineSpan => ({
  index: l.index,
  start: l.start,
  end: l.end,
  text: l.text,
});

/**
 * The workbench editing surface: the section cards on the left and the inspector
 * on the right, plus all the selection/annotation state that binds them. It owns
 * no page chrome (title, byline, mode picker, structure notice) — that's passed
 * in via `header` — so it can be mounted on its own with a fixed `mode`.
 */
export function WorkbenchSurface({
  entry,
  mode,
  view,
  onViewChange,
  header,
}: WorkbenchSurfaceProps) {
  const id = entry.id;
  const queryClient = useQueryClient();
  // Every Basic mode is line-level and multi-select: the surface tracks a set of
  // lines within one section (a selection never crosses a section boundary).
  // `lineAnchor` is the fixed end of a ⇧-click range.
  const [lineSelection, setLineSelection] = useState<LineSelection | null>(null);
  const [lineAnchor, setLineAnchor] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const sectionsWithLines = useMemo(() => deriveSections(entry), [entry]);

  const findRhyme = useMemo(
    () => makeWordFinder(entry.annotations, "rhyme-scheme"),
    [entry.annotations],
  );

  const sectionLinesOf = (sectionId: number): LineToken[] =>
    sectionsWithLines.find((s) => s.section.id === sectionId)?.lines ?? [];

  // The "current section" the inspector reports on. Every Basic mode is
  // line-level, so it keys off the line selection; `read` reports nothing.
  const activeSection =
    mode !== "read" && lineSelection
      ? (sectionsWithLines.find((s) => s.section.id === lineSelection.sectionId)?.section ?? null)
      : null;

  /**
   * Toggle a line's membership in the selection (the whole row is a
   * checkbox). A plain click accumulates — tick as many lines as you like — and
   * ⇧-click extends a range from the last-touched line. Selection stays within
   * one section; clicking into another starts fresh.
   */
  function selectLine(line: LineToken, section: SectionDTO, e: { shiftKey: boolean }) {
    const sameSection = lineSelection?.sectionId === section.id;

    if (e.shiftKey && sameSection && lineAnchor != null) {
      const nonBlank = sectionLinesOf(section.id).filter((l) => !l.blank);
      const lo = Math.min(lineAnchor, line.index);
      const hi = Math.max(lineAnchor, line.index);
      const lines = nonBlank.filter((l) => l.index >= lo && l.index <= hi).map(toLineSpan);
      setLineSelection({ sectionId: section.id, lines });
      return;
    }

    if (sameSection && lineSelection) {
      const has = lineSelection.lines.some((l) => l.index === line.index);
      const lines = has
        ? lineSelection.lines.filter((l) => l.index !== line.index)
        : [...lineSelection.lines, toLineSpan(line)].sort((a, b) => a.index - b.index);
      setLineAnchor(line.index);
      setLineSelection(lines.length ? { sectionId: section.id, lines } : null);
      return;
    }

    setLineAnchor(line.index);
    setLineSelection({ sectionId: section.id, lines: [toLineSpan(line)] });
  }

  function selectAllLines(section: SectionDTO) {
    const lines = sectionLinesOf(section.id)
      .filter((l) => !l.blank)
      .map(toLineSpan);
    if (lines.length === 0) return;
    setLineAnchor(lines[0]!.index);
    setLineSelection({ sectionId: section.id, lines });
  }

  /**
   * Write (or clear, when both `value` and `body` are null) the active mode to
   * every selected line, in one batch. This is the single line-level writer for
   * all Basic modes — a rhyme group, a device/type/sound value, a theme name, or
   * a note body all flow through here, differing only in which field they fill.
   */
  async function writeLines(value: string | null, body: string | null) {
    if (mode === "read" || !lineSelection || lineSelection.lines.length === 0) return;
    setBusy(true);
    try {
      await client.entries.setAnnotations({
        entryId: id,
        mode: mode as AnnotationMode,
        items: lineSelection.lines.map((l) => ({
          startOffset: l.start,
          endOffset: l.end,
          value,
          body,
        })),
      });
      await invalidateEntry(queryClient, id);
      // Clear the selection so the next assignment starts fresh — otherwise a
      // follow-up click would accumulate onto the lines just stamped and
      // overwrite them.
      setLineSelection(null);
      setLineAnchor(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rl-workbench">
      <div className="rl-work-main">
        <div className="rl-work-inner">
          {header}

          {entry.lyrics.trim().length === 0 ? (
            <Notice
              mt="6"
              description="Paste the lyrics in and the workbench will split them into sections you can annotate."
              actions={[
                <Notice.Action
                  key="add"
                  href={`/entries/${id}/edit`}
                  render={<RouterLink to="/entries/$entryId/edit" params={{ entryId: id }} />}
                >
                  Add lyrics
                </Notice.Action>,
              ]}
            >
              No lyrics yet
            </Notice>
          ) : (
            <Box mt="4">
              {sectionsWithLines.map(({ section, lines: sectionLines }) => (
                <SectionCard
                  key={section.id}
                  section={section}
                  lines={sectionLines}
                  mode={mode}
                  view={view}
                  lineSelection={lineSelection}
                  editing={activeSection?.id === section.id}
                  busy={busy}
                  findRhyme={findRhyme}
                  onSelectLine={selectLine}
                  onSelectAllLines={selectAllLines}
                />
              ))}
            </Box>
          )}
        </div>
      </div>

      <Inspector
        mode={mode}
        lineSelection={lineSelection}
        annotations={entry.annotations}
        activeSection={activeSection}
        view={view}
        findRhyme={findRhyme}
        onViewChange={onViewChange}
        onWriteLines={writeLines}
        busy={busy}
      />
    </div>
  );
}
