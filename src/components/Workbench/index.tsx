import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link as RouterLink } from "@tanstack/react-router";
import { Badge, Box, Flex, Heading, Notice, Text, ToggleGroup } from "@saintly-software/baritone";
import { Info as InfoIcon } from "lucide-react";
import { Eyebrow } from "#/components/Eyebrow";
import { TopBar, TopBarContext } from "#/components/TopBar";
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
    <TopBarContext
      label="Analyzing"
      value={`${entry.title}${entry.artist ? ` · ${entry.artist}` : ""}`}
    />
  );

  return (
    <>
      <TopBar context={context} />
      <div className="rl-workbench">
        <div className="rl-work-main">
          <div className="rl-work-inner">
            <Eyebrow>{eyebrow}</Eyebrow>
            <Heading level={1} size="8xl" font="serif" mt="2" style={{ lineHeight: 1.04 }}>
              {entry.title}
            </Heading>

            {byline && (
              <Text size="lg" font="serif" italic saliency="low" mt="2">
                {byline}
              </Text>
            )}

            {showBanner && sectionsWithLines.length > 0 && (
              <Notice
                intent="positive"
                icon={<InfoIcon size={18} aria-hidden />}
                close={() => setShowBanner(false)}
                mt="6"
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
              </Box>
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
