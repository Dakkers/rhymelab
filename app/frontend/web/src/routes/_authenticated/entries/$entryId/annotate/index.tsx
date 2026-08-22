import { useState } from "react";
import { Link as RouterLink, createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Box, Button, Card, Flex, Icon, Link, Text, ToggleGroup } from "@saintly-software/baritone";
import { ArrowLeft } from "lucide-react";
import { splitSections, type SectionType } from "@rhymelab/api-contract";
import { Eyebrow } from "#/components/Eyebrow";
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

/**
 * What the sidebar's picker selects — the workbench mode. `read` is the passive
 * view (no annotation tool active); the others each drive a kind of annotation.
 */
type Mode = "read" | "rhyme-scheme" | "enjambment";

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
 * Identity of a single line within the body — `"<sectionIndex>:<lineIndex>"`.
 * Sections and their lines are both positional (the body has no per-line id), so
 * a composite of the two indices is the stable key while a piece is on screen.
 */
type LineKey = `${number}:${number}`;

function AnnotatePage() {
  const { entryId } = Route.useParams();
  const [mode, setMode] = useState<Mode>("read");
  // Which lines the reader has marked while in enjambment mode. Local-only for
  // now — no draft is persisted yet; toggling a line just flips its pressed
  // state. Keyed by `LineKey` so it survives re-renders without leaning on
  // array identity.
  const [enjambed, setEnjambed] = useState<ReadonlySet<LineKey>>(new Set());
  const { data: entry } = useSuspenseQuery(
    orpc.entries.get.queryOptions({ input: { id: entryId } }),
  );

  const toggleLine = (key: LineKey) =>
    setEnjambed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });

  // Hoisted so the render can ask which section is the last one — the very last
  // line of the piece has nothing to run on into, so it isn't a mark target.
  const sections = splitSections(entry.body);

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
          <Flex render={<aside />} direction="column" className="rl-annotate-aside">
            <ToggleGroup
              aria-label="Annotation type"
              orientation="vertical"
              width="fill"
              value={mode}
              onChange={setMode}
              intent="primary"
            >
              {({ ToggleGroupItem }) => (
                <>
                  <ToggleGroupItem value="read">Read</ToggleGroupItem>
                  <ToggleGroupItem value="rhyme-scheme">Rhyme Scheme</ToggleGroupItem>
                  <ToggleGroupItem value="enjambment">Enjambment</ToggleGroupItem>
                </>
              )}
            </ToggleGroup>
          </Flex>

          <Box style={{ flex: 1, minWidth: 0 }}>
            <Card>
              {/* One block per section, each labelled with its type. The API keeps
                  `structure` at exactly one label per section (`splitSections`), so
                  the two align index-for-index — no length guard needed. */}
              <Flex direction="column" gap="6">
                {sections.map((section, sectionIndex) => {
                  // A section is a run of non-blank lines joined by `\n`
                  // (`splitSections`), so splitting on `\n` yields the lines with
                  // no blanks to guard.
                  const lines = section.split("\n");
                  const isLastSection = sectionIndex === sections.length - 1;
                  return (
                    <Flex key={sectionIndex} direction="column" gap="1">
                      <Eyebrow>{SECTION_TYPE_LABEL[entry.structure[sectionIndex]]}</Eyebrow>
                      {mode === "enjambment" ? (
                        <Flex direction="column">
                          {lines.map((line, lineIndex) => {
                            // The final line of the whole piece runs on into
                            // nothing, so it can't be enjambed — render it as
                            // plain text with no target.
                            if (isLastSection && lineIndex === lines.length - 1) {
                              return (
                                <Text key={lineIndex} className="rl-line-static" lineHeight="lyric">
                                  {line}
                                </Text>
                              );
                            }
                            // The mark lives at the line's end — where the run-on
                            // into the next line happens — so only the last word
                            // plus the trailing gap is the hit target, not the
                            // whole line. Split the line there.
                            // Keep the natural space in the lead (outside the
                            // target) so word spacing reads normally; the target
                            // is just the last word + the gap out to the end.
                            const splitAt = line.lastIndexOf(" ");
                            const lead = splitAt === -1 ? "" : line.slice(0, splitAt + 1);
                            const tail = splitAt === -1 ? line : line.slice(splitAt + 1);
                            const key: LineKey = `${sectionIndex}:${lineIndex}`;
                            return (
                              <Text
                                key={lineIndex}
                                className="rl-line-row"
                                style={{ display: "flex", alignItems: "baseline" }}
                                lineHeight="lyric"
                              >
                                {lead && <span className="rl-line-lead">{lead}</span>}
                                <button
                                  type="button"
                                  className="rl-enj-target"
                                  aria-pressed={enjambed.has(key)}
                                  onClick={() => toggleLine(key)}
                                >
                                  {tail}
                                </button>
                              </Text>
                            );
                          })}
                        </Flex>
                      ) : (
                        <Text style={{ whiteSpace: "pre-wrap" }} lineHeight="lyric">
                          {section}
                        </Text>
                      )}
                    </Flex>
                  );
                })}
              </Flex>
            </Card>
          </Box>
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
