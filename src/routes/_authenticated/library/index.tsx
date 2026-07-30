import { useSuspenseQuery } from "@tanstack/react-query";
import { Link as RouterLink, createFileRoute } from "@tanstack/react-router";
import {
  Card,
  Chip,
  ChipList,
  Flex,
  Heading,
  Link,
  Lockup,
  Text,
} from "@saintly-software/baritone";
import { Music4 as MusicIcon, Plus as PlusIcon } from "lucide-react";
import { Eyebrow } from "#/components/Eyebrow";
import { q } from "#/lib/queries";
import { entryKindLabel } from "#/lib/constants";
import { pluralize, since } from "#/lib/format";
import { useMounted } from "#/lib/hooks";
import type { EntrySummary } from "#/server/entries";

export const Route = createFileRoute("/_authenticated/library/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(q.entries.list()),
  component: LibraryPage,
});

function LibraryPage() {
  const { data: entries } = useSuspenseQuery(q.entries.list());
  const mounted = useMounted();

  return (
    <main className="rl-page">
      <Flex align="center" justify="between" gap="4" mb="8">
        <div>
          <Eyebrow>Library</Eyebrow>
          <Heading level={1} size="5xl" font="serif" mt="1" style={{ lineHeight: 1.04 }}>
            Your songs & poems
          </Heading>
        </div>
        <Link
          appearance="button"
          startIcon={<PlusIcon size={16} aria-hidden />}
          href="/entries/new"
        >
          New entry
        </Link>
      </Flex>

      {entries.length === 0 ? (
        <Card
          saliency="low"
          footer={
            <Card.Footer
              actions={
                <Card.Actions
                  side="start"
                  actions={[
                    <Link key="create" appearance="button" href="/entries/new">
                      Create your first entry
                    </Link>,
                  ]}
                />
              }
            />
          }
        >
          <Lockup
            icon={<MusicIcon aria-hidden />}
            title="Nothing here yet"
            subtitle="Add a song or poem, paste its lyrics, and start marking the music."
          />
        </Card>
      ) : (
        <div className="rl-lib-grid">
          {entries.map((e) => (
            <EntryCard key={e.id} entry={e} showTime={mounted} />
          ))}
        </div>
      )}
    </main>
  );
}

function EntryCard({ entry, showTime }: { entry: EntrySummary; showTime: boolean }) {
  const bylineBits = [entry.artist, entry.year != null ? String(entry.year) : null].filter(Boolean);
  return (
    <Card
      as="article"
      saliency="low"
      href={`/entries/${entry.id}`}
      render={<RouterLink to="/entries/$entryId" params={{ entryId: entry.id }} />}
      header={
        <Card.Header
          title={entry.title}
          subtitle={bylineBits.length > 0 ? bylineBits.join(" · ") : undefined}
          chip={<Chip size="sm">{entryKindLabel(entry.kind)}</Chip>}
        />
      }
      footer={
        <Card.Footer style={{ marginTop: "auto", justifyContent: "space-between" }}>
          <Text size="sm" saliency="low">
            {entry.hasLyrics ? pluralize(entry.annotationCount, "annotation") : "No lyrics yet"}
          </Text>
          {showTime && (
            <Text size="sm" saliency="low">
              {since(entry.updatedAt)}
            </Text>
          )}
        </Card.Footer>
      }
    >
      {entry.tags.length > 0 && (
        <ChipList size="sm" items={entry.tags.slice(0, 4).map((t) => ({ id: t, children: t }))} />
      )}
    </Card>
  );
}
