import { useSuspenseQuery } from "@tanstack/react-query";
import { Link as RouterLink, createFileRoute } from "@tanstack/react-router";
import { Card, Chip, ChipList, Flex, Link, Text } from "@saintly-software/baritone";
import { Plus as PlusIcon } from "lucide-react";
import { TopBar } from "#/components/TopBar";
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
    <>
      <TopBar />

      <main className="rl-page">
        <Flex align="center" justify="between" gap="4" style={{ marginBottom: 28 }}>
          <div>
            <div className="rl-eyebrow">Library</div>
            <h1 className="rl-title" style={{ fontSize: "2.2rem", marginTop: 4 }}>
              Your songs & poems
            </h1>
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
          <div className="rl-empty">
            <Text size="lg" style={{ marginBottom: 8 }}>
              Nothing here yet.
            </Text>
            <Text saliency="low" style={{ marginBottom: 20 }}>
              Add a song or poem, paste its lyrics, and start marking the music.
            </Text>
            <Link appearance="button" href="/entries/new">
              Create your first entry
            </Link>
          </div>
        ) : (
          <div className="rl-lib-grid">
            {entries.map((e) => (
              <EntryCard key={e.id} entry={e} showTime={mounted} />
            ))}
          </div>
        )}
      </main>
    </>
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
        <ChipList
          size="sm"
          items={entry.tags.slice(0, 4).map((t) => ({ id: t, children: t }))}
        />
      )}
    </Card>
  );
}
