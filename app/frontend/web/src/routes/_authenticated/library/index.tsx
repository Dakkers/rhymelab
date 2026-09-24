import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { CardList, Link, Text } from "@saintly-software/baritone";
import { Plus } from "lucide-react";
import { Page } from "../../../components/Page";
import { EntryCard } from "../../../components/EntryCard";
import { orpc } from "../../../lib/orpc";
import { pluralize } from "../../../lib/format";

export const Route = createFileRoute("/_authenticated/library/")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(orpc.lyricEntries.list.queryOptions()),
  component: LibraryPage,
});

function LibraryPage() {
  const { data: lyricEntries } = useSuspenseQuery(orpc.lyricEntries.list.queryOptions());

  return (
    <Page
      title="Library"
      subtitle={lyricEntries.length > 0 ? pluralize(lyricEntries.length, "saved piece") : undefined}
      actions={
        <Link appearance="button" href="/entries/new" startIcon={<Plus />}>
          New entry
        </Link>
      }
    >
      {lyricEntries.length === 0 ? (
        <Text saliency="low">
          Nothing saved yet. Your song and poems will show up here once you start writing.
        </Text>
      ) : (
        <CardList aria-label="Saved pieces" gap="3">
          {lyricEntries.map((entry) => (
            <EntryCard key={entry.id} entry={entry} />
          ))}
        </CardList>
      )}
    </Page>
  );
}
