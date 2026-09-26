import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { createFormHook, createFormHookContexts } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Card, Flex, Text, TextInput, ToggleGroup } from "@saintly-software/baritone";
import { Page } from "#/components/Page";
import { orpc } from "#/lib/orpc";
import type { CreateLyricEntryInput } from "@rhymelab/api-contract";

const DEFAULTS: NewEntryForm = {
  step: 1,
  body: "",
  kind: "song",
  title: "",
  authors: [],
  year: "",
  artists: [],
  album: "",
};

const { fieldContext, formContext } = createFormHookContexts();

const { useAppForm, withForm } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: {},
  formComponents: {},
});

const SongFields = withForm({
  defaultValues: DEFAULTS,
  render: function SongFields({ form }) {
    return (
      <>
        <form.Field name="artists">
          {(field) => (
            <TextInput
              label="Artist"
              value={field.state.value}
              onChange={(value) => field.handleChange([value.trim()])}
              onBlur={field.handleBlur}
              placeholder="Optional"
            />
          )}
        </form.Field>

        <form.Field name="authors">
          {(field) => (
            <TextInput
              label="Lyricist"
              value={field.state.value}
              onChange={(value) => field.handleChange([value.trim()])}
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
    );
  },
});

const PoemFields = withForm({
  defaultValues: DEFAULTS,
  render: function PoemFields({ form }) {
    return (
      <form.Field name="authors">
        {(field) => (
          <TextInput
            label="Author"
            value={field.state.value}
            onChange={(value) => field.handleChange([value.trim()])}
            onBlur={field.handleBlur}
            placeholder="Optional"
          />
        )}
      </form.Field>
    );
  },
});

export const Route = createFileRoute("/_authenticated/entries/new/")({
  component: NewEntryPage,
});

function NewEntryPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const createEntry = useMutation(
    orpc.lyricEntries.create.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: orpc.lyricEntries.list.key() });
        await navigate({ to: "/library" });
      },
    }),
  );

  const form = useAppForm({
    defaultValues: DEFAULTS,
    onSubmit: async ({ value }) => {
      await createEntry.mutateAsync(buildCreatePayload(value)).catch(() => {});
    },
  });

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
                  <ToggleGroupItem value="song">Song</ToggleGroupItem>
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

  const metadataStep = (
    <>
      <form.Subscribe selector={(state) => state.values.kind}>
        {(kind) => (kind === "song" ? <SongFields form={form} /> : <PoemFields form={form} />)}
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
          {(isSubmitting) => (
            <Button type="submit" loading={isSubmitting}>
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

function buildCreatePayload({ step: _step, ...values }: NewEntryForm): CreateLyricEntryInput {
  const base = {
    title: values.title.trim(),
    authors: values.authors,
    body: values.body,
    year: values.year.trim() ? Number(values.year) : undefined,
  };
  return values.kind === "song"
    ? {
        ...base,
        kind: "song" as const,
        artists: values.artists,
        album: values.album.trim() || undefined,
      }
    : { ...base, kind: "poem" as const };
}

type NewEntryForm = Omit<CreateLyricEntryInput, "year"> & {
  step: 1 | 2;
  album: string;
  artists: string[];
  year: string;
};
