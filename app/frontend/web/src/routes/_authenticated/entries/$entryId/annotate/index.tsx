import { useState } from "react";
import { Link as RouterLink, createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Box, Card, Flex, Icon, Link, Text, ToggleGroup } from "@saintly-software/baritone";
import { ArrowLeft } from "lucide-react";
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

/** What the sidebar's picker selects — the kind of annotation being worked on. */
type AnnotationKind = "rhyme-scheme" | "enjambment";

function AnnotatePage() {
  const { entryId } = Route.useParams();
  const [kind, setKind] = useState<AnnotationKind>("rhyme-scheme");
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
            value={kind}
            onChange={setKind}
            intent="primary"
          >
            {({ ToggleGroupItem }) => (
              <>
                <ToggleGroupItem value="rhyme-scheme">Rhyme Scheme</ToggleGroupItem>
                <ToggleGroupItem value="enjambment">Enjambment</ToggleGroupItem>
              </>
            )}
          </ToggleGroup>
        </Flex>

        <Box style={{ flex: 1, minWidth: 0 }}>
          <Card>
            <Text style={{ whiteSpace: "pre-wrap" }} lineHeight="lyric">
              {entry.body}
            </Text>
          </Card>
        </Box>
      </Flex>
    </Page>
  );
}
