import { createFileRoute } from "@tanstack/react-router";
import { Text } from "@saintly-software/baritone";
import { Page } from "#/components/Page";

export const Route = createFileRoute("/_authenticated/account/settings/")({
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <Page title="Settings">
      <Text saliency="low">Nothing here yet.</Text>
    </Page>
  );
}
