import type { ReactNode } from "react";
import { createFileRoute, Link as RouterLink } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Badge, Card, CardList, InlineList, Link, Text } from "@saintly-software/baritone";
import type { EntrySummary } from "@rhymelab/api-contract";
import { Page } from "../../../components/Page";
import { orpc } from "../../../lib/orpc";
import { names, pluralize, since } from "../../../lib/format";
import { useMounted } from "../../../lib/hooks";

/**
 * The Library is the signed-in default landing page: the list of lyrics and
 * poems the user has saved (over oRPC's `entries.list`, newest-edited first).
 * Reads go through the TanStack Query cache: the loader primes it so the list is
 * ready on first paint, and the component subscribes so an invalidation
 * elsewhere (e.g. after creating an entry) refetches it here.
 */
export const Route = createFileRoute("/_authenticated/library/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(orpc.entries.list.queryOptions()),
  component: LibraryPage,
});

function LibraryPage() {
  const { data: entries } = useSuspenseQuery(orpc.entries.list.queryOptions());

  return (
    <Page
      title="Library"
      subtitle={entries.length > 0 ? pluralize(entries.length, "saved piece") : undefined}
      actions={
        <Link appearance="button" href="/entries/new">
          New entry
        </Link>
      }
    >
      {entries.length === 0 ? (
        <Text saliency="low">
          Nothing saved yet. Your lyrics and poems will show up here once you start writing.
        </Text>
      ) : (
        <CardList aria-label="Saved pieces" gap="3">
          {entries.map((entry) => (
            <EntryCard key={entry.id} entry={entry} />
          ))}
        </CardList>
      )}
    </Page>
  );
}

const KIND_LABEL: Record<EntrySummary["kind"], string> = {
  lyrics: "Lyrics",
  poem: "Poem",
};

function EntryCard({ entry }: { entry: EntrySummary }) {
  return (
    <Card
      header={entry.title}
      subheader={byline(entry)}
      action={<Badge text={KIND_LABEL[entry.kind]} shape="square" saliency="low" />}
      description={entry.excerpt}
      href={`/entries/${entry.id}`}
      render={<RouterLink to="/entries/$entryId" params={{ entryId: entry.id }} />}
    >
      <InlineList
        separator={
          <Text size="sm" saliency="low">
            ·
          </Text>
        }
      >
        <Text size="sm" saliency="low">
          {pluralize(entry.lineCount, "line")}
        </Text>
        <Text size="sm" saliency="low">
          {pluralize(entry.wordCount, "word")}
        </Text>
        {/* The writer, surfaced for lyrics (a poem already names them in the
            byline) — and only when there is one: the `&&` yields "" for an
            unattributed piece, which InlineList drops along with its separator
            rather than printing a bare "Words by". */}
        {entry.kind === "lyrics" && names(entry.author) && (
          <Text size="sm" saliency="low">
            Words by {names(entry.author)}
          </Text>
        )}
        <Updated at={entry.updatedAt} />
      </InlineList>
    </Card>
  );
}

/**
 * The identity line under the title: who made it and when. A poem leads with its
 * author; lyrics lead with the performer and the record it's on. Every part is
 * optional — an unattributed piece, a single with no album, a year we don't know
 * — so the parts go in as bare strings and `InlineList` drops the empty ones
 * along with their separators. Typography is inherited from the `subheader`
 * slot, so nothing here imposes its own.
 */
function byline(entry: EntrySummary): ReactNode {
  return (
    <InlineList>
      {entry.kind === "lyrics" ? names(entry.artist) : names(entry.author)}
      {entry.kind === "lyrics" && entry.album}
      {entry.year}
    </InlineList>
  );
}

/**
 * Relative edited-time, gated behind a mount check: `since` reads the wall clock,
 * so rendering it during SSR would mismatch the client's first paint.
 */
function Updated({ at }: { at: string }) {
  const mounted = useMounted();
  return (
    <Text size="sm" saliency="low">
      {mounted ? `Edited ${since(at)}` : "Edited recently"}
    </Text>
  );
}
