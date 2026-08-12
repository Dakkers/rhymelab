import { Fragment, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Badge, Card, CardList, Flex, Text } from "@saintly-software/baritone";
import { Page } from "../../../components/Page";
import { listEntries, type EntrySummary } from "../../../lib/entries";
import { pluralize, since } from "../../../lib/format";
import { useMounted } from "../../../lib/hooks";

/**
 * The Library is the signed-in default landing page: the list of lyrics and
 * poems the user has saved. Data is stubbed (`listEntries`) until the entries
 * surface lands in the shared oRPC contract — swap the loader body then.
 */
export const Route = createFileRoute("/_authenticated/library/")({
  loader: () => listEntries(),
  component: LibraryPage,
});

function LibraryPage() {
  const entries = Route.useLoaderData();

  return (
    <Page
      title="Library"
      subtitle={entries.length > 0 ? pluralize(entries.length, "saved piece") : undefined}
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
            Words by {entry.author}
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
      ? [entry.artist, entry.album, String(entry.year)]
      : [entry.author, String(entry.year)];
  return parts.join(" · ");
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
function Updated({ at }: { at: number }) {
  const mounted = useMounted();
  return (
    <Text size="sm" saliency="low">
      {mounted ? `Edited ${since(at)}` : "Edited recently"}
    </Text>
  );
}
