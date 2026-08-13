import { createFileRoute } from "@tanstack/react-router";
import { Text } from "@saintly-software/baritone";
import { Page } from "#/components/Page";

export const Route = createFileRoute("/_authenticated/account/profile/")({
  component: ProfilePage,
});

function ProfilePage() {
  return (
    <Page title="Profile">
      <Text saliency="low">Nothing here yet.</Text>
    </Page>
  );
}
