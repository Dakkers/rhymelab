import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button, Card, Flex, Link, TextInput } from "@saintly-software/baritone";
import { TopBar } from "#/components/TopBar";
import {
  EntryFields,
  emptyEntryForm,
  toEntryPayload,
  type EntryFormState,
} from "#/components/EntryForm";
import { createEntry } from "#/server/entries";
import { invalidateEntries } from "#/lib/queries";

export const Route = createFileRoute("/_authenticated/entries/new/")({
  component: NewEntryPage,
});

function NewEntryPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<EntryFormState>(emptyEntryForm);
  const [lyrics, setLyrics] = useState("");
  const [busy, setBusy] = useState(false);
  const [showErr, setShowErr] = useState(false);

  const patch = (p: Partial<EntryFormState>) => setForm((s) => ({ ...s, ...p }));

  async function submit() {
    if (!form.title.trim()) {
      setShowErr(true);
      return;
    }
    setBusy(true);
    try {
      const { id } = await createEntry({ data: { ...toEntryPayload(form), lyrics } });
      await invalidateEntries(queryClient);
      await navigate({ to: "/entries/$entryId", params: { entryId: id } });
    } catch {
      setBusy(false);
    }
  }

  return (
    <>
      <TopBar />
      <main className="rl-page rl-page--narrow">
        <div style={{ marginBottom: 24 }}>
          <div className="rl-eyebrow">New entry</div>
          <h1 className="rl-title" style={{ fontSize: "2rem", marginTop: 4 }}>
            Add a song or poem
          </h1>
        </div>

        <Flex direction="column" gap="6">
          <Card saliency="low">
            <EntryFields value={form} onChange={patch} disabled={busy} showTitleError={showErr} />
          </Card>

          <Card saliency="low">
            <TextInput
              multiline
              rows={14}
              label="Lyrics"
              helpText="Paste the full text. Leave a blank line between sections — they'll be detected automatically. You can edit this later."
              value={lyrics}
              onChange={(e) => setLyrics(e.target.value)}
              disabled={busy}
              placeholder={"Once upon a midnight dreary, while I pondered, weak and weary,\n…"}
              spellCheck={false}
            />
          </Card>

          <Flex align="center" justify="between" gap="3">
            <Link appearance="button" intent="neutral" saliency="low" href="/library">
              Cancel
            </Link>
            <Button onClick={submit} loading={busy} disabled={busy}>
              Create entry
            </Button>
          </Flex>
        </Flex>
      </main>
    </>
  );
}
