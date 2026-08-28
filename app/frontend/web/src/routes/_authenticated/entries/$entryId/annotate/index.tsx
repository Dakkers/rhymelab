import { Fragment, useState } from "react";
import { Link as RouterLink, createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Box, Button, Card, Flex, Icon, Link, Text, ToggleGroup } from "@saintly-software/baritone";
import { ArrowLeft, BookOpen, CornerDownLeft, Music } from "lucide-react";
import { splitSections, type EntryDetail, type SectionType } from "@rhymelab/api-contract";
import { Eyebrow } from "#/components/Eyebrow";
import { Page } from "#/components/Page";
import { orpc } from "#/lib/orpc";

/**
 * Display labels for the closed set of section types — the raw values are lower-
 * case slugs (`prechorus`), so this is where they get their human casing and the
 * hyphen a reader expects.
 *
 * Deliberately a second copy of the detail page's map rather than a shared one:
 * the annotate view is about to grow selection, per-line marks, and hit targets
 * the read-only view has no use for, and the two will diverge. Hoist this into a
 * shared component once they've settled and it's clear what's actually common.
 */
const SECTION_TYPE_LABEL: Record<SectionType, string> = {
  intro: "Intro",
  verse: "Verse",
  prechorus: "Pre-Chorus",
  chorus: "Chorus",
  bridge: "Bridge",
  outro: "Outro",
};

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
  const { data: entry } = useSuspenseQuery(
    orpc.entries.get.queryOptions({ input: { id: entryId } }),
  );

  // Read is the passive view where existing annotations surface; the editing
  // tools own their own rendering, so gate the marks on it.
  const showAnnotations = mode === "read";

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
          <ModePicker value={mode} onChange={setMode} />

          <LyricSheet entry={entry} showAnnotations={showAnnotations} />
        </Flex>

        {/* Sticky footer — pinned to the bottom of the viewport while the text
            scrolls under it (the document body is the scroll container; the nav
            bar owns the top). Only shown while an annotation tool is active:
            `read` is a passive view with nothing to save, so it has no action
            bar. The buttons are placeholders — no draft state is wired yet. */}
        {mode !== "read" && (
          <Flex
            render={<footer />}
            className="rl-annotate-footer"
            align="center"
            justify="end"
            gap="3"
          >
            <Button saliency="low">Discard</Button>
            <Button intent="primary">Save</Button>
          </Flex>
        )}
      </Flex>
    </Page>
  );
}

/**
 * The workbench's mode picker — the sidebar rail that selects which annotation
 * tool is active. Controlled: it owns no state, so the page stays the single
 * source of truth for the current mode.
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
 * The piece itself — one labelled block per section, with the enjambment marks
 * hanging off the lines they run on from. Hover/focus state lives here because
 * nothing outside the sheet reacts to it: `linesById` says which lines an
 * enjambment binds, and this decides which of them is lit.
 */
function LyricSheet({
  entry,
  showAnnotations,
}: {
  entry: Pick<EntryDetail, "body" | "structure" | "annotations">;
  showAnnotations: boolean;
}) {
  // Which enjambment (by id) is currently hovered/focused — the pair of lines it
  // binds gets outlined while it is.
  const [hoveredEnjambment, setHoveredEnjambment] = useState<string | null>(null);

  // Line-level annotations are indexed into `entry.body.split("\n")` — the same
  // coordinate space they were authored in. For each enjambment, the icon hangs
  // off its *first* line (the run-on point), and hovering it outlines the whole
  // pair of lines the annotation binds. `iconByLine` maps that first line to the
  // annotation id; `linesById` is the set of lines to outline while it's hovered.
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

  // Sections as the card renders them (one labelled block each), every line
  // tagged with its global index so the enjambment marks can be placed. The body
  // is normalized, so `splitSections` round-trips it and sections are separated
  // by exactly one blank line — hence `+ 1` per section to skip that separator.
  let lineCursor = 0;
  const sections = splitSections(entry.body).map((section, index) => {
    const lines = section.split("\n").map((text, i) => ({ text, globalIndex: lineCursor + i }));
    lineCursor += lines.length + 1;
    return { label: entry.structure[index], lines };
  });

  return (
    <Box style={{ flex: 1, minWidth: 0 }}>
      <Card>
        {/* One block per section, each labelled with its type. The API keeps
            `structure` at exactly one label per section (`splitSections`), so
            the two align index-for-index — no length guard needed. Lines are
            rendered individually (interleaved with the `\n` that `pre-wrap`
            breaks on) so an enjambment mark can hang off a line's end. */}
        <Flex direction="column" gap="6">
          {sections.map(({ label, lines }, index) => (
            <Flex key={index} direction="column" gap="1">
              <Eyebrow>{SECTION_TYPE_LABEL[label]}</Eyebrow>
              <Text style={{ whiteSpace: "pre-wrap" }} lineHeight="lyric">
                {lines.map((line, i) => (
                  <Fragment key={i}>
                    {i > 0 && "\n"}
                    <LyricLine
                      text={line.text}
                      outlined={outlinedLines?.has(line.globalIndex) ?? false}
                      enjambmentId={showAnnotations ? iconByLine.get(line.globalIndex) : undefined}
                      onHoverEnjambment={setHoveredEnjambment}
                    />
                  </Fragment>
                ))}
              </Text>
            </Flex>
          ))}
        </Flex>
      </Card>
    </Box>
  );
}

/**
 * One line of the piece, with the enjambment mark that hangs off its end. Both
 * the outline and the mark are told to it rather than worked out here: the sheet
 * owns the annotation index and the hover, so a line only knows whether it is
 * currently lit and which enjambment (if any) runs on from it.
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
 * What the sidebar's picker selects — the workbench mode. `read` is the passive
 * view (no annotation tool active); the others each drive a kind of annotation.
 */
type Mode = "read" | "rhyme-scheme" | "enjambment";
