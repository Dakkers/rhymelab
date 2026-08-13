import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useForm } from "@tanstack/react-form";
import { Button, Card, Flex, Text, TextInput, ToggleGroup } from "@saintly-software/baritone";
import type { EntryKind } from "@rhymelab/api-contract";
import { Page } from "#/components/Page";

export const Route = createFileRoute("/_authenticated/entries/new/")({
  component: NewEntryPage,
});

/**
 * The two-step "new entry" form. `step` lives in the form's own state (rather than
 * a separate `useState`) so advancing is just `setFieldValue("step", …)` and every
 * pane reads it through the same `form.Subscribe` the fields use. It's UI state, so
 * it's stripped back out before the create payload is built.
 */
interface NewEntryForm {
  /** Which pane is showing. Set on Next / Back; not part of the saved entry. */
  step: 1 | 2;
  /** Step 1 — the raw text of the piece. */
  body: string;
  /** Step 2 — metadata. */
  kind: EntryKind;
  title: string;
  author: string;
  /** Kept as a string for the text control; parsed when the payload is built. */
  year: string;
  /** Lyrics-only; ignored for poems. */
  artist: string;
  album: string;
}

const DEFAULTS: NewEntryForm = {
  step: 1,
  body: "",
  kind: "lyrics",
  title: "",
  author: "",
  year: "",
  artist: "",
  album: "",
};

/**
 * Stubbed create call — stands in for the not-yet-built `entries.create`
 * procedure. Drops the UI-only `step`, coerces `year`, and narrows the
 * lyrics-only fields off `kind` so the shape matches the contract's union.
 */
async function createEntryStub({ step: _step, ...values }: NewEntryForm) {
  const base = {
    title: values.title.trim(),
    author: values.author.trim(),
    body: values.body,
    year: values.year.trim() ? Number(values.year) : undefined,
  };
  const payload =
    values.kind === "lyrics"
      ? {
          ...base,
          kind: "lyrics" as const,
          artist: values.artist.trim(),
          album: values.album.trim(),
        }
      : { ...base, kind: "poem" as const };
  // TODO: replace with `client.entries.create(payload)` once the procedure lands.
  await new Promise((resolve) => setTimeout(resolve, 400));
  console.info("[stub] entries.create", payload);
}

function NewEntryPage() {
  const navigate = useNavigate();

  const form = useForm({
    defaultValues: DEFAULTS,
    onSubmit: async ({ value }) => {
      await createEntryStub(value);
      await navigate({ to: "/library" });
    },
  });

  // Step 1 — the required title (with the kind alongside it) and the big text
  // box. Next is gated on the title and body; kind always carries a default.
  const lyricsStep = (
    <>
      <Flex justify="between" align="start" gap="6">
        <Flex.Item grow>
          <form.Field name="title">
            {(field) => (
              <TextInput
                label="Title"
                required
                value={field.state.value}
                onChange={(value) => field.handleChange(value)}
                onBlur={field.handleBlur}
                autoFocus
              />
            )}
          </form.Field>
        </Flex.Item>

        <form.Field name="kind">
          {(field) => (
            <ToggleGroup
              label="Kind"
              required
              value={field.state.value}
              onChange={(value) => field.handleChange(value)}
            >
              {({ ToggleGroupItem }) => (
                <>
                  <ToggleGroupItem value="lyrics">Lyrics</ToggleGroupItem>
                  <ToggleGroupItem value="poem">Poem</ToggleGroupItem>
                </>
              )}
            </ToggleGroup>
          )}
        </form.Field>
      </Flex>

      <form.Field name="body">
        {(field) => (
          <TextInput
            multiline
            rows={14}
            label="Lyrics"
            placeholder="Type or paste the words here…"
            value={field.state.value}
            onChange={(value) => field.handleChange(value)}
            onBlur={field.handleBlur}
            required
          />
        )}
      </form.Field>

      <Flex justify="between" align="center" gap="3">
        <Text size="sm" saliency="low">
          Step 1 of 2
        </Text>
        <form.Subscribe
          selector={(state) =>
            state.values.title.trim().length > 0 && state.values.body.trim().length > 0
          }
        >
          {(ready) => (
            <Button type="button" disabled={!ready} onClick={() => form.setFieldValue("step", 2)}>
              Next
            </Button>
          )}
        </form.Subscribe>
      </Flex>
    </>
  );

  // Step 2 — the metadata; the lyrics-only fields appear only for the lyrics kind.
  const metadataStep = (
    <>
      <form.Field name="author">
        {(field) => (
          <TextInput
            label="Author"
            helpText="The writer — a poem's poet, or a song's lyricist."
            value={field.state.value}
            onChange={(value) => field.handleChange(value)}
            onBlur={field.handleBlur}
            placeholder="Optional"
          />
        )}
      </form.Field>

      {/* Lyrics-only fields — hidden for poems, matching the contract's union. */}
      <form.Subscribe selector={(state) => state.values.kind}>
        {(kind) =>
          kind === "lyrics" ? (
            <>
              <form.Field name="artist">
                {(field) => (
                  <TextInput
                    label="Artist"
                    value={field.state.value}
                    onChange={(value) => field.handleChange(value)}
                    onBlur={field.handleBlur}
                    placeholder="Optional"
                  />
                )}
              </form.Field>
              <form.Field name="album">
                {(field) => (
                  <TextInput
                    label="Album"
                    value={field.state.value}
                    onChange={(value) => field.handleChange(value)}
                    placeholder="Optional"
                    onBlur={field.handleBlur}
                  />
                )}
              </form.Field>
            </>
          ) : null
        }
      </form.Subscribe>

      <form.Field name="year">
        {(field) => (
          <TextInput
            label="Year"
            inputMode="numeric"
            placeholder="Optional"
            value={field.state.value}
            onChange={(value) => field.handleChange(value)}
            onBlur={field.handleBlur}
          />
        )}
      </form.Field>

      <Flex justify="between" align="center" gap="3">
        <Button type="button" appearance="text" onClick={() => form.setFieldValue("step", 1)}>
          Back
        </Button>
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(submitting) => (
            <Button type="submit" loading={submitting}>
              Save entry
            </Button>
          )}
        </form.Subscribe>
      </Flex>
    </>
  );

  return (
    <Page title="New entry" subtitle="Add a piece to your library.">
      <Card style={{ maxWidth: 640 }}>
        <Flex
          render={
            <form
              onSubmit={(event) => {
                event.preventDefault();
                event.stopPropagation();
                void form.handleSubmit();
              }}
            />
          }
          direction="column"
          gap="4"
        >
          <form.Subscribe selector={(state) => state.values.step}>
            {(step) => (step === 1 ? lyricsStep : metadataStep)}
          </form.Subscribe>
        </Flex>
      </Card>
    </Page>
  );
}
