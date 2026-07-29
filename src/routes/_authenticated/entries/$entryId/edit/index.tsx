import { useState } from "react";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button, Card, Flex, Link, Text, TextInput } from "@saintly-software/baritone";
import { TopBar } from "#/components/TopBar";
import {
  EntryFields,
  entryToForm,
  toEntryPayload,
  type EntryFormState,
} from "#/components/EntryForm";
import { q, invalidateEntry, invalidateEntries } from "#/lib/queries";
import { entryIdParams } from "#/lib/url";
import { deleteEntry, saveLyrics, updateEntry, type EntryDetail } from "#/server/entries";

export const Route = createFileRoute("/_authenticated/entries/$entryId/edit/")({
  // A malformed id never reaches the loader: `params.parse` rejects it during
  // matching and the router falls through to the 404.
  params: entryIdParams,
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(q.entries.detail(params.entryId)),
  component: EditEntryPage,
});

function MissingEntry() {
  return (
    <>
      <TopBar />
      <main className="rl-page rl-page--narrow">
        <div className="rl-empty">That entry doesn't exist (or was deleted).</div>
      </main>
    </>
  );
}

function EditEntryPage() {
  const { entryId: id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: entry } = useSuspenseQuery(q.entries.detail(id));

  if (!entry) return <MissingEntry />;

  // Key on the entry id (not updatedAt): switching entries gets a fresh form, but
  // a save — which bumps updatedAt — must NOT remount and discard in-progress
  // edits or swallow the "Saved / N detached" message.
  return <EditForm key={id} entry={entry} id={id} navigate={navigate} qc={queryClient} />;
}

function EditForm({
  entry,
  id,
  navigate,
  qc,
}: {
  entry: EntryDetail;
  id: number;
  navigate: ReturnType<typeof useNavigate>;
  qc: ReturnType<typeof useQueryClient>;
}) {
  const [form, setForm] = useState<EntryFormState>(() => entryToForm(entry));
  const [lyrics, setLyrics] = useState(entry.lyrics);
  const [savingDetails, setSavingDetails] = useState(false);
  const [savingLyrics, setSavingLyrics] = useState(false);
  const [detailsSaved, setDetailsSaved] = useState(false);
  const [lyricsMsg, setLyricsMsg] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const patch = (p: Partial<EntryFormState>) => {
    setForm((s) => ({ ...s, ...p }));
    setDetailsSaved(false);
  };

  async function saveDetails() {
    if (!form.title.trim()) return;
    setSavingDetails(true);
    try {
      await updateEntry({ data: { id, ...toEntryPayload(form) } });
      await invalidateEntry(qc, id);
      setDetailsSaved(true);
    } finally {
      setSavingDetails(false);
    }
  }

  async function saveLyricsAction() {
    setSavingLyrics(true);
    setLyricsMsg(null);
    try {
      const res = await saveLyrics({ data: { id, lyrics } });
      await invalidateEntry(qc, id);
      setLyricsMsg(
        res.detached > 0
          ? `Saved. ${res.detached} annotation${res.detached === 1 ? "" : "s"} could no longer be placed and were detached.`
          : "Saved.",
      );
    } finally {
      setSavingLyrics(false);
    }
  }

  async function onDelete() {
    await deleteEntry({ data: { id } });
    await invalidateEntries(qc);
    await navigate({ to: "/library" });
  }

  return (
    <>
      <TopBar
        context={
          <span className="rl-topbar-context">
            <span className="label">Editing</span>
            <span className="value">{entry.title}</span>
          </span>
        }
      />
      <main className="rl-page rl-page--narrow">
        <Flex align="center" justify="between" gap="3" style={{ marginBottom: 22 }}>
          <div>
            <div className="rl-eyebrow">Edit entry</div>
            <h1 className="rl-title" style={{ fontSize: "1.9rem", marginTop: 4 }}>
              {entry.title}
            </h1>
          </div>
          <Link appearance="button" intent="neutral" saliency="low" href={`/entries/${id}`}>
            Open workbench
          </Link>
        </Flex>

        <Flex direction="column" gap="6">
          <Card saliency="low">
            <Text className="rl-eyebrow" style={{ marginBottom: 14, display: "block" }}>
              Details
            </Text>
            <EntryFields value={form} onChange={patch} disabled={savingDetails} showTitleError />
            <Flex align="center" gap="3" style={{ marginTop: 18 }}>
              <Button onClick={saveDetails} loading={savingDetails} disabled={savingDetails}>
                Save details
              </Button>
              {detailsSaved && (
                <Text size="sm" intent="positive">
                  Saved.
                </Text>
              )}
            </Flex>
          </Card>

          <Card saliency="low">
            <Text className="rl-eyebrow" style={{ marginBottom: 8, display: "block" }}>
              Lyrics
            </Text>
            <TextInput
              multiline
              rows={14}
              aria-label="Lyrics"
              helpText="Blank lines separate sections. Editing the text re-detects sections and re-places existing annotations where it can."
              value={lyrics}
              onChange={(e) => {
                setLyrics(e.target.value);
                setLyricsMsg(null);
              }}
              disabled={savingLyrics}
              spellCheck={false}
            />
            <Flex align="center" gap="3" style={{ marginTop: 14 }}>
              <Button onClick={saveLyricsAction} loading={savingLyrics} disabled={savingLyrics}>
                Save lyrics
              </Button>
              {lyricsMsg && (
                <Text size="sm" saliency="low">
                  {lyricsMsg}
                </Text>
              )}
            </Flex>
          </Card>

          <Card saliency="low" intent="negative">
            <Text className="rl-eyebrow" style={{ marginBottom: 10, display: "block" }}>
              Danger zone
            </Text>
            {confirmDelete ? (
              <Flex align="center" gap="3" wrap>
                <Text size="sm">Delete “{entry.title}” and all its annotations?</Text>
                <Button intent="negative" onClick={onDelete}>
                  Delete permanently
                </Button>
                <Button
                  appearance="text"
                  intent="neutral"
                  saliency="low"
                  onClick={() => setConfirmDelete(false)}
                >
                  Cancel
                </Button>
              </Flex>
            ) : (
              <Button intent="negative" saliency="low" onClick={() => setConfirmDelete(true)}>
                Delete entry
              </Button>
            )}
          </Card>
        </Flex>
      </main>
    </>
  );
}
