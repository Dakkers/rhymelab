import { Fragment, type ReactNode } from "react";
import { createFileRoute, Link as RouterLink } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Badge, Card, CardList, Flex, Link, Text } from "@saintly-software/baritone";
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
      <MetaRow>
        <Text size="sm" saliency="low">
          {pluralize(entry.lineCount, "line")}
        </Text>
        <Text size="sm" saliency="low">
          {pluralize(entry.wordCount, "word")}
        </Text>
        {/* The writer, surfaced for lyrics (a poem already names them in the byline). */}
        {entry.kind === "lyrics" && (
          <Text size="sm" saliency="low">
            Words by {names(entry.author)}
          </Text>
        )}
        <Updated at={entry.updatedAt} />
      </MetaRow>
    </Card>
  );
}

/**
 * The identity line under the title: who made it and when. A poem leads with its
 * author; lyrics lead with the performer and the record it's on.
 */
function byline(entry: EntrySummary): string {
  const parts =
    entry.kind === "lyrics"
      ? [names(entry.artist), entry.album, entry.year]
      : [names(entry.author), entry.year];
  // `year` is optional, so drop it (and any other gap) rather than print "undefined".
  return parts.filter((part) => part !== undefined).join(" · ");
}

/** A row of low-saliency metadata, dot-separated and wrapping on narrow cards. */
function MetaRow({ children }: { children: ReactNode }) {
  const items = Array.isArray(children) ? children.filter(Boolean) : [children];
  return (
    <Flex gap="2" align="center" wrap>
      {items.map((item, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <Text size="sm" saliency="low" aria-hidden>
              ·
            </Text>
          )}
          {item}
        </Fragment>
      ))}
    </Flex>
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
