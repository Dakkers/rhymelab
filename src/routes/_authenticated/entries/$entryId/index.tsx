import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { TopBar } from "#/components/TopBar";
import { Workbench } from "#/components/Workbench";
import { q } from "#/lib/queries";

/** A positive integer id, or null for a malformed `/entries/:id` path. */
function parseEntryId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export const Route = createFileRoute("/_authenticated/entries/$entryId/")({
  loader: ({ context, params }) => {
    const id = parseEntryId(params.entryId);
    if (id == null) return;
    return context.queryClient.ensureQueryData(q.entries.detail(id));
  },
  component: EntryPage,
});

function MissingEntry() {
  return (
    <>
      <TopBar />
      <main className="rl-page">
        <div className="rl-empty">That entry doesn't exist (or was deleted).</div>
      </main>
    </>
  );
}

function EntryPage() {
  const { entryId } = Route.useParams();
  const id = parseEntryId(entryId);
  // Guard the malformed-id case before the suspense hook so a bad URL renders the
  // empty state instead of throwing (the server validator rejects id <= 0 / NaN).
  if (id == null) return <MissingEntry />;
  return <EntryView id={id} />;
}

function EntryView({ id }: { id: number }) {
  const { data: entry } = useSuspenseQuery(q.entries.detail(id));
  if (!entry) return <MissingEntry />;
  return <Workbench entry={entry} />;
}
