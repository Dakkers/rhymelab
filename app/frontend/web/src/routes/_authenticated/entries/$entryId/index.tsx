import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Card, InlineList, Text } from "@saintly-software/baritone";
import type { EntryDetail } from "@rhymelab/api-contract";
import { Page } from "#/components/Page";
import { names } from "#/lib/format";
import { orpc } from "#/lib/orpc";

/**
 * A saved piece's detail view — fetched over oRPC's `entries.get`, scoped to the
 * id in the URL. Reads go through the TanStack Query cache the same way the
 * Library does: the loader primes it so the piece is ready on first paint, and
 * the component subscribes with `useSuspenseQuery`.
 */
export const Route = createFileRoute("/_authenticated/entries/$entryId/")({
  loader: ({ params, context }) =>
    context.queryClient.ensureQueryData(
      orpc.entries.get.queryOptions({ input: { id: params.entryId } }),
    ),
  component: EntryPage,
});

const KIND_LABEL: Record<EntryDetail["kind"], string> = {
  lyrics: "Lyrics",
  poem: "Poem",
};

function EntryPage() {
  const { entryId } = Route.useParams();
  const { data: entry } = useSuspenseQuery(
    orpc.entries.get.queryOptions({ input: { id: entryId } }),
  );

  return (
    <Page title={entry.title} subtitle={byline(entry)}>
      <Card header={<Card.Header title={KIND_LABEL[entry.kind]} />}>
        <Text style={{ whiteSpace: "pre-wrap" }} lineHeight="lyric">
          {entry.body}
        </Text>
      </Card>
    </Page>
  );
}

/**
 * The identity line under the title: who made it and when. A poem leads with
 * its author; lyrics lead with the performer and the record it's on — same
 * convention as the Library's `byline`, minus the excerpt/line/word stats the
 * summary carries and the detail view doesn't.
 */
function byline(entry: EntryDetail): ReactNode {
  // `author`/`artist` are lists — a piece can credit several people; `names`
  // joins each into one run so the line reads as a sentence rather than a column.
  const credit = entry.kind === "lyrics" ? names(entry.artist) : names(entry.author);
  const album = entry.kind === "lyrics" ? entry.album : undefined;

  // Every part is optional, so bail before rendering rather than hand `Page` an
  // element that draws an empty subtitle block — `subtitle != null` can't see
  // that an InlineList with nothing in it renders nothing.
  if (!credit && !album && entry.year === undefined) return undefined;

  return (
    <InlineList>
      {credit}
      {album}
      {entry.year}
    </InlineList>
  );
}
