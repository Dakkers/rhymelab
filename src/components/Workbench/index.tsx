import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Badge, Flex, Link, Notice, ToggleGroup } from "@saintly-software/baritone";
import { Info as InfoIcon } from "lucide-react";
import { TopBar } from "#/components/TopBar";
import {
  MODE_META,
  VIEW_MODES,
  entryKindLabel,
  type AnnotationMode,
  type RhymeView,
  type SectionType,
  type ViewMode,
} from "#/lib/constants";
import { defaultSectionLabel, linesInRange, parseLines, type WordToken } from "#/lib/lyrics";
import { invalidateEntry } from "#/lib/queries";
import { setAnnotation, updateSection, type EntryDetail, type SectionDTO } from "#/server/entries";
import { Inspector } from "./Inspector";
import { SectionCard } from "./SectionCard";
import { makeWordFinder, type Selection } from "./logic";

interface WorkbenchProps {
  entry: EntryDetail;
  /** Which annotation layer is active. Lives in the URL (`?mode=`). */
  mode: ViewMode;
  /** How rhyme groups are drawn. Lives in the URL (`?view=`). */
  view: RhymeView;
  onModeChange: (mode: ViewMode) => void;
  onViewChange: (view: RhymeView) => void;
}

export function Workbench({ entry, mode, view, onModeChange, onViewChange }: WorkbenchProps) {
  const id = entry.id;
  const queryClient = useQueryClient();
  const [selection, setSelection] = useState<Selection | null>(null);
  // The fixed end of a shift-click range: a plain click sets it, shift-clicks
  // extend from it (so a phrase can be grown/shrunk by repeated shift-clicks).
  const [anchorIndex, setAnchorIndex] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [showBanner, setShowBanner] = useState(true);

  const { allWords, sectionsWithLines } = useMemo(() => {
    const parsed = parseLines(entry.lyrics);
    const words = parsed.flatMap((l) => l.words);
    const secs: SectionDTO[] =
      entry.sections.length > 0
        ? entry.sections
        : entry.lyrics.trim().length > 0
          ? [
              {
                id: -1,
                orderIndex: 0,
                type: "verse",
                label: "Lyrics",
                startOffset: 0,
                endOffset: entry.lyrics.length,
              },
            ]
          : [];
    return {
      lines: parsed,
      allWords: words,
      sectionsWithLines: secs.map((s) => ({
        section: s,
        lines: linesInRange(parsed, s.startOffset, s.endOffset),
      })),
    };
  }, [entry.lyrics, entry.sections]);

  const findCurrent = useMemo(
    () => makeWordFinder(entry.annotations, mode),
    [entry.annotations, mode],
  );
  const findRhyme = useMemo(
    () => makeWordFinder(entry.annotations, "rhyme-structure"),
    [entry.annotations],
  );

  const activeSection =
    selection != null
      ? (sectionsWithLines.find(
          (s) => selection.start >= s.section.startOffset && selection.start < s.section.endOffset,
        )?.section ?? null)
      : null;

  function selectWord(word: WordToken, shift: boolean) {
    if (shift && anchorIndex != null) {
      const anchor = allWords[anchorIndex];
      if (anchor) {
        const start = Math.min(anchor.start, word.start);
        const end = Math.max(anchor.end, word.end);
        const single = anchor.wordIndex === word.wordIndex;
        // Keep `anchorIndex` fixed so the next shift-click re-extends from it.
        setSelection({
          start,
          end,
          text: entry.lyrics.slice(start, end),
          wordIndex: single ? word.wordIndex : null,
        });
        return;
      }
    }
    setAnchorIndex(word.wordIndex);
    setSelection({ start: word.start, end: word.end, text: word.text, wordIndex: word.wordIndex });
  }

  async function write(value: string | null, body: string | null) {
    if (!selection || mode === "read") return;
    setBusy(true);
    try {
      await setAnnotation({
        data: {
          entryId: id,
          mode: mode as AnnotationMode,
          startOffset: selection.start,
          endOffset: selection.end,
          value,
          body,
        },
      });
      await invalidateEntry(queryClient, id);
    } finally {
      setBusy(false);
    }
  }

  async function clearMode(m: AnnotationMode) {
    if (!selection) return;
    setBusy(true);
    try {
      await setAnnotation({
        data: {
          entryId: id,
          mode: m,
          startOffset: selection.start,
          endOffset: selection.end,
          value: null,
          body: null,
        },
      });
      await invalidateEntry(queryClient, id);
    } finally {
      setBusy(false);
    }
  }

  async function changeSectionType(section: SectionDTO, type: SectionType) {
    if (section.id < 0) return;
    setBusy(true);
    try {
      await updateSection({
        data: { id: section.id, type, label: defaultSectionLabel(type, section.orderIndex + 1) },
      });
      await invalidateEntry(queryClient, id);
    } finally {
      setBusy(false);
    }
  }

  const eyebrow = [entryKindLabel(entry.kind), entry.tags[0]].filter(Boolean).join(" · ");
  const byline = [entry.artist, entry.year != null ? String(entry.year) : null]
    .filter(Boolean)
    .join(" · ");
  const context = (
    <span className="rl-topbar-context">
      <span className="label">Analyzing</span>
      <span className="value">
        {entry.title}
        {entry.artist ? ` · ${entry.artist}` : ""}
      </span>
    </span>
  );

  return (
    <>
      <TopBar context={context} />
      <div className="rl-workbench">
        <div className="rl-work-main">
          <div className="rl-work-inner">
            <div className="rl-eyebrow">{eyebrow}</div>
            <h1 className="rl-title" style={{ fontSize: "2.9rem", marginTop: 6 }}>
              {entry.title}
            </h1>
            {byline && (
              <div className="rl-byline" style={{ fontSize: "1.15rem", marginTop: 6 }}>
                {byline}
              </div>
            )}

            {showBanner && sectionsWithLines.length > 0 && (
              <Notice
                intent="positive"
                icon={<InfoIcon size={18} aria-hidden />}
                close={() => setShowBanner(false)}
                style={{ marginTop: 20 }}
              >
                Structure auto-detected — <strong>{sectionsWithLines.length} sections</strong>.
                Change a section's type from its header.
              </Notice>
            )}

            <div className="rl-modebar">
              <ToggleGroup label="Mode" labelPosition="start" value={mode} onChange={onModeChange}>
                {({ ToggleGroupItem }) => (
                  <>
                    {VIEW_MODES.map((m) => (
                      <ToggleGroupItem key={m} value={m}>
                        <Flex inline align="center" gap="2" render={<span />}>
                          <Badge shape="round" size="sm" color={MODE_META[m].color} />
                          {MODE_META[m].label}
                        </Flex>
                      </ToggleGroupItem>
                    ))}
                  </>
                )}
              </ToggleGroup>
            </div>

            {entry.lyrics.trim().length === 0 ? (
              <div className="rl-empty" style={{ marginTop: 24 }}>
                No lyrics yet. <Link href={`/entries/${id}/edit`}>Add lyrics</Link> to start
                annotating.
              </div>
            ) : (
              <div style={{ marginTop: 18 }}>
                {sectionsWithLines.map(({ section, lines: sectionLines }) => (
                  <SectionCard
                    key={section.id}
                    section={section}
                    lines={sectionLines}
                    mode={mode}
                    view={view}
                    selection={selection}
                    editing={activeSection?.id === section.id}
                    busy={busy}
                    findCurrent={findCurrent}
                    findRhyme={findRhyme}
                    onSelectWord={selectWord}
                    onSelectFinalWord={(line) => {
                      const last = line.words[line.words.length - 1];
                      if (last) selectWord(last, false);
                    }}
                    onChangeType={(type) => changeSectionType(section, type)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <Inspector
          mode={mode}
          selection={selection}
          annotations={entry.annotations}
          activeSection={activeSection}
          view={view}
          onViewChange={onViewChange}
          onWrite={write}
          onClearMode={clearMode}
          busy={busy}
        />
      </div>
    </>
  );
}
