import { useState } from "react";
import { Link as RouterLink, createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Box, Card, Flex, Icon, Link, Text, ToggleGroup } from "@saintly-software/baritone";
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

function AnnotatePage() {
  const { entryId } = Route.useParams();
  const [mode, setMode] = useState<Mode>("read");
  const { data: entry } = useSuspenseQuery(
    orpc.entries.get.queryOptions({ input: { id: entryId } }),
  );

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
      <Flex align="start" gap="6">
        <Flex render={<aside />} direction="column" className="rl-annotate-aside">
          {/* `ToggleGroup` is a single-line `inline-flex` toolbar; `rl-toggle-column`
              turns it down the page and stretches the segments to the sidebar's
              width. Same override seam the rhyme-group grid used — one class on
              each side, winning only because app.css is linked after Baritone's
              stylesheet (see __root.tsx). Segment box, colour and focus ring stay
              Baritone's; drop this if ToggleGroup grows an `orientation` prop. */}
          <ToggleGroup
            aria-label="Annotation type"
            className="rl-toggle-column"
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
              {splitSections(entry.body).map((section, index) => (
                <Flex key={index} direction="column" gap="1">
                  <Eyebrow>{SECTION_TYPE_LABEL[entry.structure[index]]}</Eyebrow>
                  <Text style={{ whiteSpace: "pre-wrap" }} lineHeight="lyric">
                    {section}
                  </Text>
                </Flex>
              ))}
            </Flex>
          </Card>
        </Box>
      </Flex>
    </Page>
  );
}
