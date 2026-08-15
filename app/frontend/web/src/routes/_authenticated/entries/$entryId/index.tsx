import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Badge, Text } from "@saintly-software/baritone";
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
    <Page
      title={entry.title}
      subtitle={byline(entry)}
      actions={<Badge text={KIND_LABEL[entry.kind]} shape="square" saliency="low" />}
    >
      <Text style={{ whiteSpace: "pre-wrap" }} lineHeight="lyric">
        {entry.body}
      </Text>
    </Page>
  );
}

/**
 * The identity line under the title: who made it and when. A poem leads with
 * its author; lyrics lead with the performer and the record it's on — same
 * convention as the Library's `byline`, minus the excerpt/line/word stats the
 * summary carries and the detail view doesn't.
 */
function byline(entry: EntryDetail): string | undefined {
  // `author`/`artist` are lists — a piece can credit several people; join them
  // into one name run so the byline reads as a sentence rather than a column.
  const parts =
    entry.kind === "lyrics"
      ? [names(entry.artist), entry.album, entry.year]
      : [names(entry.author), entry.year];
  const joined = parts.filter((part) => part !== undefined && part !== "").join(" · ");
  return joined || undefined;
}
