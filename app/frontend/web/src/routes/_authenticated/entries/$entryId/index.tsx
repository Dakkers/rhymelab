import { createFileRoute } from "@tanstack/react-router";
import { Text } from "@saintly-software/baritone";
import { Page } from "#/components/Page";

/**
 * Stubbed fetch call — stands in for the not-yet-built `entries.get`
 * procedure. Mirrors the shape `entries/new` stubbed for `entries.create`.
 */
async function getEntryStub(entryId: string) {
  // TODO: replace with `client.entries.get({ id: entryId })` once the procedure lands.
  await new Promise((resolve) => setTimeout(resolve, 400));
  console.info("[stub] entries.get", { id: entryId });
  return null;
}

export const Route = createFileRoute("/_authenticated/entries/$entryId/")({
  loader: ({ params }) => getEntryStub(params.entryId),
  component: EntryPage,
});

function EntryPage() {
  return (
    <Page title="Entry">
      <Text saliency="low">Nothing here yet.</Text>
    </Page>
  );
}
