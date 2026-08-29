import { useState } from "react";
import { Link as RouterLink, createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useForm, useStore } from "@tanstack/react-form";
import {
  Box,
  Button,
  Card,
  ConfirmationModal,
  Flex,
  Icon,
  Link,
  Text,
  ToggleGroup,
} from "@saintly-software/baritone";
import { ArrowLeft, BookOpen, CornerDownLeft, Music, TriangleAlert } from "lucide-react";
import type { Annotation, EntryDetail } from "@rhymelab/api-contract";
import { LyricSections, toSheetSections, type SheetLine } from "#/components/LyricSections";
import { Page } from "#/components/Page";
import { orpc } from "#/lib/orpc";

/**
 * The annotation workbench for one piece. Same read path as the detail view —
 * the loader primes `entries.get` so the text is there on first paint, and the
 * component subscribes to the same cache entry, so arriving from the detail
 * page reuses what it already fetched.
 */
export const Route = createFileRoute("/_authenticated/entries/$entryId/annotate/")({
  loader: ({ params, context }) =>
    context.queryClient.ensureQueryData(
      orpc.entries.get.queryOptions({ input: { id: params.entryId } }),
    ),
  component: AnnotatePage,
});

function AnnotatePage() {
  const { entryId } = Route.useParams();
  const [mode, setMode] = useState<Mode>("read");
  // The tool the user is trying to switch to while the draft has unsaved edits,
  // parked until they confirm or cancel the discard. `null` when nothing is
  // pending (no guard showing).
  const [pendingMode, setPendingMode] = useState<Mode | null>(null);
  const { data: entry } = useSuspenseQuery(
    orpc.entries.get.queryOptions({ input: { id: entryId } }),
  );

  // The enjambment draft lives in a TanStack form so one store answers both
  // questions the workbench asks of it: *which* lines run on (drives the marks)
  // and *whether* there are unsaved edits (guards the tool switch below).
  // `enjambments` is the set of run-on line indices — the `startIndex` of each
  // line-level enjambment, i.e. the same coordinate space `entry.annotations`
  // are authored in (`body.split("\n")`).
  const form = useForm({
    defaultValues: { enjambments: deriveEnjambments(entry.annotations) },
    // There's no annotations write path yet (see `AnnotationSchema` — no store
    // behind it), so "Save" can't persist. Until it can, submitting just stamps
    // the current draft as the new baseline so the dirty state clears; wiring the
    // real create/delete mutation is the next step.
    onSubmit: ({ formApi }) => formApi.reset(formApi.state.values),
  });

  const enjambments = useStore(form.store, (state) => state.values.enjambments);
  // `isDirty` in TanStack Form is *sticky*: it flips true on the first edit and
  // never clears when a value is toggled back to its default. `isDefaultValue`
  // is the real "differs from what's saved" signal — a deep compare against the
  // defaults — so the unsaved-changes checks all read off its negation.
  const hasChanges = useStore(form.store, (state) => !state.isDefaultValue);

  const toggleLine = (lineIndex: number) =>
    form.setFieldValue("enjambments", (prev) => toggleEnjambment(prev, lineIndex));

  // Every tool switch routes through here so a draft can't be dropped silently:
  // with unsaved edits, hold the target tool and let the confirm dialog decide;
  // otherwise switch straight away.
  const requestMode = (next: Mode) => {
    if (next === mode) return;
    if (hasChanges) setPendingMode(next);
    else setMode(next);
  };

  const discardAndSwitch = () => {
    form.reset();
    if (pendingMode !== null) setMode(pendingMode);
    setPendingMode(null);
  };

  return (
    <Page
      title="Annotate"
      actions={
        // Baritone has no icon-only arm for `Link appearance="button"` — that
        // arm requires a visible label and types `aria-label` as `never` (so a
        // label can't be silently overridden). With the glyph as the only
        // content there's no visible text to name the control, so the name goes
        // on the anchor itself, through the `render` element.
        <Link
          appearance="button"
          saliency="low"
          render={
            <RouterLink
              to="/entries/$entryId"
              params={{ entryId }}
              aria-label="Back to entry details"
            />
          }
        >
          <Icon>
            <ArrowLeft />
          </Icon>
        </Link>
      }
    >
      <Flex direction="column" gap="6">
        <Flex align="start" gap="6">
          <ModePicker value={mode} onChange={requestMode} />

          <LyricSheet
            entry={entry}
            mode={mode}
            enjambments={enjambments}
            onToggleLine={toggleLine}
          />
        </Flex>

        {mode !== "read" && (
          <ActionBar
            hasChanges={hasChanges}
            onDiscard={() => form.reset()}
            onSave={() => void form.handleSubmit()}
          />
        )}
      </Flex>

      {/* Guards a tool switch that would drop unsaved marks. Controlled (no
          trigger): opened by parking a `pendingMode`, and either confirmed
          (discard the draft, then switch) or dismissed (stay put). */}
      <ConfirmationModal
        open={pendingMode !== null}
        onOpenChange={(open) => {
          if (!open) setPendingMode(null);
        }}
        intent="warning"
        icon={
          <Icon>
            <TriangleAlert />
          </Icon>
        }
        header="Discard unsaved marks?"
        confirm={{ children: "Discard and switch" }}
        handleConfirm={discardAndSwitch}
      >
        <Text render={<p />}>
          You&rsquo;ve changed the enjambment marks but haven&rsquo;t saved them. Switching tools
          will discard those changes.
        </Text>
      </ConfirmationModal>
    </Page>
  );
}

/**
 * The workbench's mode picker — the sidebar rail that selects which annotation
 * tool is active. Controlled: it owns no state, so the page stays the single
 * source of truth for the current mode. `onChange` is the page's guarded switch,
 * so picking a tool mid-edit can raise the unsaved-changes prompt rather than
 * switching outright.
 */
function ModePicker({ value, onChange }: { value: Mode; onChange: (mode: Mode) => void }) {
  return (
    <Flex render={<aside />} direction="column" className="rl-annotate-aside">
      <ToggleGroup
        aria-label="Annotation type"
        orientation="vertical"
        width="fill"
        value={value}
        onChange={onChange}
        intent="primary"
      >
        {({ ToggleGroupItem }) => (
          <>
            <ToggleGroupItem value="read">
              <Icon>
                <BookOpen />
              </Icon>
              Read
            </ToggleGroupItem>
            <ToggleGroupItem value="rhyme-scheme">
              <Icon>
                <Music />
              </Icon>
              Rhyme Scheme
            </ToggleGroupItem>
            <ToggleGroupItem value="enjambment">
              <Icon>
                <CornerDownLeft />
              </Icon>
              Enjambment
            </ToggleGroupItem>
          </>
        )}
      </ToggleGroup>
    </Flex>
  );
}

/**
 * The piece itself — one labelled block per section. The lines are laid out as
 * text the `pre-wrap` newline breaks (so long lines wrap and the words keep their
 * lyric setting), with each line rendered individually so a mark can hang off its
 * end.
 *
 * The rendering is mode-specific:
 *  - `read` surfaces the saved marks — the enjambment glyph hangs off the line it
 *    runs on from, and hovering it outlines the pair it binds.
 *  - `enjambment` is the editor — a line's tail (its last word) becomes a click
 *    target that toggles whether it runs on into the next line.
 *  - `rhyme-scheme` renders the bare text for now (its own tool comes later).
 */
function LyricSheet({
  entry,
  mode,
  enjambments,
  onToggleLine,
}: {
  entry: Pick<EntryDetail, "body" | "structure" | "annotations">;
  mode: Mode;
  enjambments: number[];
  onToggleLine: (lineIndex: number) => void;
}) {
  const editing = mode === "enjambment";

  // Which enjambment (by id) is currently hovered/focused in the read view — the
  // pair of lines it binds gets outlined while it is.
  const [hoveredEnjambment, setHoveredEnjambment] = useState<string | null>(null);

  // Read-view index of the saved marks. For each enjambment the glyph hangs off
  // its *first* line (the run-on point), and hovering it outlines the whole pair
  // the annotation binds. `iconByLine` maps that first line to the annotation id;
  // `linesById` is the set of lines to outline while it's hovered. Only the read
  // view consumes this, so it's inert in the editing/rhyme tools.
  const iconByLine = new Map<number, string>();
  const linesById = new Map<string, Set<number>>();
  for (const annotation of entry.annotations) {
    if (annotation.type === "enjambment" && annotation.granularity === "line") {
      iconByLine.set(annotation.startIndex, annotation.id);
      const covered = new Set<number>();
      for (let i = annotation.startIndex; i < annotation.endIndex; i++) covered.add(i);
      linesById.set(annotation.id, covered);
    }
  }
  const outlinedLines = hoveredEnjambment ? linesById.get(hoveredEnjambment) : undefined;

  // The draft's run-on lines, as a set for O(1) lookup while rendering.
  const runsOn = new Set(enjambments);

  // Sections as the card renders them (one labelled block each), every line
  // tagged with its global index so the marks can be placed.
  const sections = toSheetSections(entry);

  // The very last line of the piece can't run on into anything, so it's never a
  // click target. (A section's *own* last line stays selectable — enjambment
  // across a stanza break is a real thing; only the final line has no "next".)
  const lastSection = sections.at(-1);
  const lastLineIndex = lastSection?.lines.at(-1)?.globalIndex;

  // How a single line renders is mode-specific, and it needs everything the
  // sheet computed above (the annotation index, the hover, the draft). The
  // section blocks only lay lines out, so the choice is made here and handed
  // down as the thing to render for each line.
  const renderLine = (line: SheetLine) =>
    editing ? (
      <EnjambmentLine
        text={line.text}
        selected={runsOn.has(line.globalIndex)}
        selectable={line.globalIndex !== lastLineIndex}
        onToggle={() => onToggleLine(line.globalIndex)}
      />
    ) : (
      <LyricLine
        text={line.text}
        outlined={outlinedLines?.has(line.globalIndex) ?? false}
        enjambmentId={mode === "read" ? iconByLine.get(line.globalIndex) : undefined}
        onHoverEnjambment={setHoveredEnjambment}
      />
    );

  return (
    <Box style={{ flex: 1, minWidth: 0 }}>
      <Card>
        <LyricSections sections={sections} renderLine={renderLine} />
      </Card>
    </Box>
  );
}

/**
 * One line as the *read* view shows it, with the enjambment glyph that hangs off
 * its end. Both the outline and the glyph are told to it rather than worked out
 * here: the sheet owns the annotation index and the hover, so a line only knows
 * whether it is currently lit and which enjambment (if any) runs on from it.
 *
 * Rendered inline (a `span`, not a block) — the sheet lays its lines out with
 * the `\n` that `pre-wrap` breaks on, so anything block-level here would break
 * that interleaving.
 */
function LyricLine({
  text,
  outlined,
  enjambmentId,
  onHoverEnjambment,
}: {
  text: string;
  outlined: boolean;
  enjambmentId: string | undefined;
  onHoverEnjambment: (id: string | null) => void;
}) {
  return (
    <>
      <span
        style={
          outlined
            ? { outline: "1px dashed currentColor", outlineOffset: "3px", borderRadius: "2px" }
            : undefined
        }
      >
        {text}
      </span>
      {enjambmentId !== undefined && (
        <Icon
          label="Enjambment — hover to see both lines"
          size="sm"
          tabIndex={0}
          onMouseEnter={() => onHoverEnjambment(enjambmentId)}
          onMouseLeave={() => onHoverEnjambment(null)}
          onFocus={() => onHoverEnjambment(enjambmentId)}
          onBlur={() => onHoverEnjambment(null)}
          style={{
            marginInlineStart: "0.35em",
            verticalAlign: "middle",
            opacity: 0.55,
            cursor: "help",
          }}
        >
          <CornerDownLeft />
        </Icon>
      )}
    </>
  );
}

/**
 * One line as the *enjambment editor* shows it. The line's tail — its last word,
 * padded into a soft-bordered hit area (the "gap") — is the click target that
 * toggles whether this line runs on into the next; the rest of the line is inert
 * text. A pressed tail carries the run-on glyph. The last line of the piece has
 * no target (`selectable === false`), so it renders as plain text.
 *
 * Inline, like {@link LyricLine}: the tail is an inline control so the line still
 * wraps and the `pre-wrap` newline still separates it from the next.
 */
function EnjambmentLine({
  text,
  selected,
  selectable,
  onToggle,
}: {
  text: string;
  selected: boolean;
  selectable: boolean;
  onToggle: () => void;
}) {
  const { head, tail } = splitTail(text);

  // Nothing to click (final line, or a line with no word to grab) — plain text.
  if (!selectable || tail === "") return <>{text}</>;

  return (
    <>
      {head}
      <button
        type="button"
        className="rl-enj-hit"
        aria-pressed={selected}
        aria-label={`${selected ? "Remove" : "Add"} enjambment after “${tail.trim()}”`}
        onClick={onToggle}
      >
        {tail}
        {selected && (
          <Icon size="sm" className="rl-enj-hit-glyph">
            <CornerDownLeft />
          </Icon>
        )}
      </button>
    </>
  );
}

/**
 * The workbench's action bar — a sticky footer pinned to the bottom of the
 * viewport while the text scrolls under it (the document body is the scroll
 * container; the nav bar owns the top).
 *
 * Both actions are gated on unsaved changes: there's nothing to discard or save
 * when the draft matches what's stored. Saving can't persist yet (no annotations
 * write path); it just re-baselines the draft for now.
 */
function ActionBar({
  hasChanges,
  onDiscard,
  onSave,
}: {
  hasChanges: boolean;
  onDiscard: () => void;
  onSave: () => void;
}) {
  return (
    <Flex render={<footer />} className="rl-annotate-footer" align="center" justify="end" gap="3">
      <Button saliency="low" disabled={!hasChanges} onClick={onDiscard}>
        Discard
      </Button>
      <Button intent="primary" disabled={!hasChanges} onClick={onSave}>
        Save
      </Button>
    </Flex>
  );
}

/**
 * Split a line into its leading text and its tail (the last word plus any
 * trailing whitespace) — the tail is the enjambment hit target. `head + tail`
 * reconstructs the line exactly, so the rendered text is unchanged. A blank or
 * word-less line yields an empty tail (no hit target).
 */
function splitTail(text: string): { head: string; tail: string } {
  const lastSpace = text.replace(/\s+$/, "").lastIndexOf(" ");
  return { head: text.slice(0, lastSpace + 1), tail: text.slice(lastSpace + 1) };
}

/**
 * The run-on line indices already saved for this piece — the `startIndex` of
 * every line-level enjambment, de-duplicated and sorted. This is the draft's
 * baseline: the editor toggles lines in and out of it, and the form compares
 * against it to know whether there are unsaved changes.
 */
function deriveEnjambments(annotations: readonly Annotation[]): number[] {
  const runOnLines = new Set<number>();
  for (const annotation of annotations) {
    if (annotation.type === "enjambment" && annotation.granularity === "line") {
      runOnLines.add(annotation.startIndex);
    }
  }
  return [...runOnLines].sort((a, b) => a - b);
}

/**
 * Toggle one line's enjambment in the draft, returned sorted. Sorted on purpose:
 * the form detects changes by comparing this array *positionally* against the
 * saved baseline (`isDefaultValue`), so a stable order keeps "same set of lines"
 * reading as "no change" no matter what order they were clicked in.
 */
function toggleEnjambment(lines: number[], lineIndex: number): number[] {
  return lines.includes(lineIndex)
    ? lines.filter((i) => i !== lineIndex)
    : [...lines, lineIndex].sort((a, b) => a - b);
}

/**
 * What the sidebar's picker selects — the workbench mode. `read` is the passive
 * view (no annotation tool active); the others each drive a kind of annotation.
 */
type Mode = "read" | "rhyme-scheme" | "enjambment";
