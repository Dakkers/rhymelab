import type { ReactNode } from "react";
import { createFileRoute, Link as RouterLink } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  Badge,
  Card,
  CardList,
  Flex,
  Icon,
  InlineList,
  Link,
  Text,
} from "@saintly-software/baritone";
import { AlignLeft, Clock, PenLine, Plus, CaseSensitive } from "lucide-react";
import { Page } from "../../../components/Page";
import { orpc } from "../../../lib/orpc";
import { names, pluralize, since } from "../../../lib/format";
import { useMounted } from "../../../lib/hooks";
import type { LyricEntryListItem } from "@rhymelab/api-contract";

const KIND_LABEL: Record<LyricEntryListItem["kind"], string> = {
  song: "Song",
  poem: "Poem",
};

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
        <Link
          appearance="button"
          href="/entries/new"
          startIcon={
            <Icon>
              <Plus />
            </Icon>
          }
        >
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

function EntryCard({ entry }: { entry: LyricEntryListItem }) {
  return (
    <Card
      header={entry.title}
      subheader={byline(entry)}
      action={<Badge text={KIND_LABEL[entry.kind]} shape="square" saliency="low" />}
      description={entry.excerpt}
      href={`/lyricEntries/${entry.id}`}
      render={<RouterLink to="/entries/$entryId" params={{ entryId: entry.id }} />}
    >
      <InlineList
        separator={
          <Text size="sm" saliency="low">
            ·
          </Text>
        }
      >
        <Stat icon={<AlignLeft />}>{pluralize(entry.lineCount, "line")}</Stat>
        <Stat icon={<CaseSensitive />}>{pluralize(entry.wordCount, "word")}</Stat>
        {entry.kind === "song" && names(entry.authors) && (
          <Stat icon={<PenLine />}>Words by {names(entry.authors)}</Stat>
        )}
        <Updated at={entry.updatedAt} />
      </InlineList>
    </Card>
  );
}

function byline(entry: LyricEntryListItem): ReactNode {
  return (
    <InlineList>
      {entry.kind === "song" ? names(entry.artists) : names(entry.authors)}
      {entry.kind === "song" && entry.album}
      {entry.year}
    </InlineList>
  );
}

function Updated({ at }: { at: string }) {
  const mounted = useMounted();
  return <Stat icon={<Clock />}>{mounted ? `Edited ${since(at)}` : "Edited recently"}</Stat>;
}

function Stat({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <Text size="sm" saliency="low" render={<Flex inline align="center" gap="1" />}>
      <Icon size="sm">{icon}</Icon>
      {children}
    </Text>
  );
}
