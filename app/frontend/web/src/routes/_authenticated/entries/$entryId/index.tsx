import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Card, ConfirmationModal, InlineList, Menu, Text } from "@saintly-software/baritone";
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
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: entry } = useSuspenseQuery(
    orpc.entries.get.queryOptions({ input: { id: entryId } }),
  );

  // Controlled rather than using `ConfirmationModal.Trigger`: the thing that
  // opens it lives inside the menu, which closes on activation, so the dialog's
  // open state has to outlive its trigger.
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const deleteEntry = useMutation(
    orpc.entries.delete.mutationOptions({
      onSuccess: async () => {
        // This page is now a 404 — drop the cached detail and the list's stale
        // copy of it, then leave before anything can refetch the deleted piece.
        queryClient.removeQueries({ queryKey: orpc.entries.get.key({ input: { id: entryId } }) });
        await queryClient.invalidateQueries({ queryKey: orpc.entries.list.key() });
        await navigate({ to: "/library" });
      },
    }),
  );

  return (
    <Page
      title={entry.title}
      subtitle={byline(entry)}
      actions={
        <Menu
          trigger={<Menu.Trigger saliency="low">Actions</Menu.Trigger>}
          items={[
            {
              children: "Delete Entry",
              intent: "negative",
              onClick: () => {
                deleteEntry.reset();
                setConfirmingDelete(true);
              },
            },
          ]}
        />
      }
    >
      <Card header={<Card.Header title={KIND_LABEL[entry.kind]} />}>
        <Text style={{ whiteSpace: "pre-wrap" }} lineHeight="lyric">
          {entry.body}
        </Text>
      </Card>

      <ConfirmationModal
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        header={`Delete “${entry.title}”?`}
        loading={deleteEntry.isPending}
        confirm={{
          children: "Delete Entry",
          // `preventDefault` keeps the dialog up while the request is in flight
          // — it closes by unmounting when the redirect lands, and stays open
          // (showing the error below) if the delete fails.
          onClick: (event) => {
            event.preventDefault();
            deleteEntry.mutate({ id: entryId });
          },
        }}
      >
        <Text>
          It won’t appear in your library any more. The text isn’t erased from the database, so this
          can be undone by hand — but not from the app.
        </Text>
        {deleteEntry.isError && (
          <Text intent="negative">Couldn’t delete this entry. Try again.</Text>
        )}
      </ConfirmationModal>
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
