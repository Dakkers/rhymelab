import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import {
  Button,
  Card,
  ConfirmationModal,
  Drawer,
  Icon,
  InlineList,
  Menu,
  Text,
  TextInput,
} from "@saintly-software/baritone";
import { PenLine, Trash2 } from "lucide-react";
import { normalizeEntryBody, type ReadLyricEntryDetail } from "@rhymelab/api-contract";
import { LyricSections, toSheetSections } from "#/components/LyricSections";
import { Page } from "#/components/Page";
import { names } from "#/lib/format";
import { orpc } from "#/lib/orpc";

const KIND_LABEL: Record<ReadLyricEntryDetail["kind"], string> = {
  song: "Song",
  poem: "Poem",
};

export const Route = createFileRoute("/_authenticated/entries/$entryId/")({
  loader: ({ params, context }) =>
    context.queryClient.ensureQueryData(
      orpc.lyricEntries.getItem.queryOptions({ input: { id: params.entryId } }),
    ),
  component: EntryPage,
});

function EntryPage() {
  const { entryId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: entry } = useSuspenseQuery(
    orpc.lyricEntries.getItem.queryOptions({ input: { id: entryId } }),
  );

  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const [editingText, setEditingText] = useState(false);
  const [draft, setDraft] = useState(entry.body);
  const normalizedDraft = normalizeEntryBody(draft);
  const normalizedStored = normalizeEntryBody(entry.body);

  const updateBody = useMutation(
    orpc.lyricEntries.updateBody.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: orpc.lyricEntries.getItem.key({ input: { id: entryId } }),
        });
        void queryClient.invalidateQueries({ queryKey: orpc.lyricEntries.list.key() });
        setEditingText(false);
      },
    }),
  );

  const deleteEntry = useMutation(
    orpc.lyricEntries.delete.mutationOptions({
      onSuccess: async () => {
        queryClient.removeQueries({
          queryKey: orpc.lyricEntries.getItem.key({ input: { id: entryId } }),
        });
        await queryClient.invalidateQueries({ queryKey: orpc.lyricEntries.list.key() });
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
            <Menu.Item
              key="edit"
              // icon={<PenLine />}
              onClick={() => {
                setDraft(entry.body);
                setEditingText(true);
              }}
            >
              Edit Text
            </Menu.Item>,
            <Menu.Item
              key="delete"
              intent="negative"
              // icon={<Trash2 />}
              onClick={() => {
                setConfirmingDelete(true);
              }}
            >
              Delete Entry
            </Menu.Item>,
          ]}
        />
      }
    >
      <Card>
        <LyricSections sections={toSheetSections(entry)} renderLine={(line) => line.text} />
      </Card>

      <Drawer
        open={editingText}
        onOpenChange={setEditingText}
        disabled={updateBody.isPending}
        header={<Drawer.Header title="Edit text" subtitle={entry.title} />}
        footer={
          <Drawer.Footer
            actions={[
              <Button
                key="cancel"
                saliency="low"
                disabled={updateBody.isPending}
                onClick={() => setEditingText(false)}
              >
                Cancel
              </Button>,
              <Button
                key="save"
                loading={updateBody.isPending}
                disabled={!normalizedDraft || normalizedDraft === normalizedStored}
                onClick={() => updateBody.mutate({ id: entryId, body: draft })}
              >
                Save
              </Button>,
            ]}
          />
        }
      >
        <TextInput
          multiline
          rows={18}
          label="Text"
          value={draft}
          onChange={(value) => setDraft(value)}
          required
        />
      </Drawer>

      <ConfirmationModal
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        header={`Delete “${entry.title}”?`}
        loading={deleteEntry.isPending}
        confirm={{
          children: "Delete Entry",
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
      </ConfirmationModal>
    </Page>
  );
}

function byline(entry: ReadLyricEntryDetail): ReactNode {
  const credit = entry.kind === "song" ? names(entry.artists) : names(entry.authors);
  const album = entry.kind === "song" ? entry.album : undefined;

  if (!credit && !album && entry.year === undefined) return undefined;

  return (
    <InlineList>
      {credit}
      {album}
      {entry.year}
    </InlineList>
  );
}
