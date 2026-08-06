import { useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link as RouterLink } from "@tanstack/react-router";
import { ORPCError } from "@orpc/client";
import { Box, Notice } from "@saintly-software/baritone";
import { type LineToken, type RhymeGroup, type RhymeView } from "@rhymelab/core";
import type { EntryDetail, SectionDTO } from "@rhymelab/api-contract";
import { client } from "#/lib/orpc";
import { invalidateEntry } from "#/lib/queries";
import { Inspector } from "./Inspector";
import { SectionCard } from "./SectionCard";
import {
  annotatableLines,
  deriveSections,
  makeRhymeFinder,
  type LineSelection,
  type LineSpan,
} from "./logic";

interface WorkbenchSurfaceProps {
  entry: EntryDetail;
  /** How rhyme groups are drawn. */
  view: RhymeView;
  onViewChange: (view: RhymeView) => void;
  /** Page chrome rendered above the sections (title, notices). The surface itself
   *  renders none of it, so a test can mount just the editing surface by leaving
   *  this out. */
  header?: ReactNode;
}

const toLineSpan = (l: LineToken, lineInSection: number): LineSpan => ({
  index: l.index,
  lineInSection,
  start: l.start,
  end: l.end,
  text: l.text,
});

/**
 * The workbench editing surface: the section cards on the left and the inspector
 * on the right, plus all the selection/annotation state that binds them. It owns
 * no page chrome (title, byline, structure notice) — that's passed in via
 * `header` — so it can be mounted on its own.
 */
export function WorkbenchSurface({ entry, view, onViewChange, header }: WorkbenchSurfaceProps) {
  const id = entry.id;
  const queryClient = useQueryClient();
  // Annotation is line-level and multi-select: the surface tracks a set of lines
  // within one section (a selection never crosses a section boundary).
  // `lineAnchor` is the fixed end of a ⇧-click range (by global line index).
  const [lineSelection, setLineSelection] = useState<LineSelection | null>(null);
  const [lineAnchor, setLineAnchor] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  // Set when a write 409s because the lyrics changed under us (another tab/save):
  // we reload fresh data and tell the user their pending stamp was dropped.
  const [reloadedNotice, setReloadedNotice] = useState(false);

  const sectionsWithLines = useMemo(() => deriveSections(entry), [entry]);
  const findRhyme = useMemo(() => makeRhymeFinder(entry), [entry]);

  const sectionLinesOf = (sectionId: number): LineToken[] =>
    sectionsWithLines.find((s) => s.section.id === sectionId)?.lines ?? [];

  // The "current section" the inspector reports on — the one holding the selection.
  const activeSection = lineSelection
    ? (sectionsWithLines.find((s) => s.section.id === lineSelection.sectionId)?.section ?? null)
    : null;
  const activeSectionLineCount = activeSection
    ? annotatableLines(sectionLinesOf(activeSection.id)).length
    : 0;

  /**
   * Toggle a line's membership in the selection (the whole row is a checkbox). A
   * plain click accumulates and ⇧-click extends a range from the last-touched line.
   * Selection stays within one section; clicking into another starts fresh.
   */
  function selectLine(
    line: LineToken,
    lineInSection: number,
    section: SectionDTO,
    e: { shiftKey: boolean },
  ) {
    setReloadedNotice(false);
    const sameSection = lineSelection?.sectionId === section.id;

    if (e.shiftKey && sameSection && lineAnchor != null) {
      const items = annotatableLines(sectionLinesOf(section.id));
      const lo = Math.min(lineAnchor, line.index);
      const hi = Math.max(lineAnchor, line.index);
      const lines = items
        .filter((it) => it.line.index >= lo && it.line.index <= hi)
        .map((it) => toLineSpan(it.line, it.lineInSection));
      setLineSelection({ sectionId: section.id, lines });
      return;
    }

    if (sameSection && lineSelection) {
      const has = lineSelection.lines.some((l) => l.index === line.index);
      const lines = has
        ? lineSelection.lines.filter((l) => l.index !== line.index)
        : [...lineSelection.lines, toLineSpan(line, lineInSection)].sort(
            (a, b) => a.index - b.index,
          );
      setLineAnchor(line.index);
      setLineSelection(lines.length ? { sectionId: section.id, lines } : null);
      return;
    }

    setLineAnchor(line.index);
    setLineSelection({ sectionId: section.id, lines: [toLineSpan(line, lineInSection)] });
  }

  function selectAllLines(section: SectionDTO) {
    const lines = annotatableLines(sectionLinesOf(section.id)).map((it) =>
      toLineSpan(it.line, it.lineInSection),
    );
    if (lines.length === 0) return;
    setLineAnchor(lines[0]!.index);
    setLineSelection({ sectionId: section.id, lines });
  }

  /** Run a mutation, refreshing the entry and recovering from a 409 the same way a
   *  stale-lyrics write does (reload + drop the pending selection). */
  async function runWrite(op: () => Promise<unknown>) {
    setBusy(true);
    setReloadedNotice(false);
    try {
      await op();
      await invalidateEntry(queryClient, id);
      setLineSelection(null);
      setLineAnchor(null);
    } catch (err) {
      if (err instanceof ORPCError && err.code === "CONFLICT") {
        await invalidateEntry(queryClient, id);
        setLineSelection(null);
        setLineAnchor(null);
        setReloadedNotice(true);
      } else {
        throw err;
      }
    } finally {
      setBusy(false);
    }
  }

  /**
   * Write the rhyme group (or clear it, when `value` is null) to every selected
   * line, in one batch, addressed by `(sectionId, lineInSection)`. Assigning is
   * REPLACE-at-line (`setLineGroups`); clearing is `clearLines`. Both carry the
   * entry's base `version`; a lyrics change under us 409s → reload + drop selection.
   */
  async function writeLines(value: RhymeGroup | null) {
    if (!lineSelection || lineSelection.lines.length === 0) return;
    const sectionId = lineSelection.sectionId;
    const items = lineSelection.lines.map((l) => ({ sectionId, lineInSection: l.lineInSection }));
    await runWrite(() =>
      value === null
        ? client.entries.clearLines({ entryId: id, version: entry.version, items })
        : client.entries.setLineGroups({
            entryId: id,
            version: entry.version,
            items: items.map((it) => ({ ...it, value })),
          }),
    );
  }

  /** Unlink a duplicate section so it can be annotated on its own (§5.3). */
  const unlinkSection = (sectionId: number) =>
    runWrite(() =>
      client.entries.unlinkSection({ entryId: id, version: entry.version, sectionId }),
    );

  /** Relink a section back to its group — deletes its own rows (confirmed first). */
  const relinkSection = (sectionId: number) =>
    runWrite(() =>
      client.entries.relinkSection({ entryId: id, version: entry.version, sectionId }),
    );

  return (
    <div className="rl-workbench">
      <div className="rl-work-main">
        <div className="rl-work-inner">
          {header}

          {reloadedNotice && (
            <Notice
              mt="4"
              intent="warning"
              description="The lyrics changed somewhere else, so we reloaded them. Your last change wasn't applied — reselect the lines and try again."
            >
              Lyrics changed — reloaded
            </Notice>
          )}

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
                  entry={entry}
                  section={section}
                  lines={sectionLines}
                  view={view}
                  lineSelection={lineSelection}
                  editing={activeSection?.id === section.id}
                  busy={busy}
                  findRhyme={findRhyme}
                  onSelectLine={selectLine}
                  onSelectAllLines={selectAllLines}
                  onUnlink={unlinkSection}
                  onRelink={relinkSection}
                />
              ))}
            </Box>
          )}
        </div>
      </div>

      <Inspector
        lineSelection={lineSelection}
        activeSection={activeSection}
        activeSectionLineCount={activeSectionLineCount}
        view={view}
        findRhyme={findRhyme}
        onViewChange={onViewChange}
        onWriteLines={writeLines}
        busy={busy}
      />
    </div>
  );
}
