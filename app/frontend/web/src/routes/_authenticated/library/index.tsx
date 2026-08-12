import { createFileRoute } from "@tanstack/react-router";
import { Flex, Heading } from "@saintly-software/baritone";

/**
 * The Library is the signed-in default landing page. For now it's just the
 * heading; the list of the user's pieces will hang off of this once the UX is
 * built out.
 */
export const Route = createFileRoute("/_authenticated/library/")({
  component: LibraryPage,
});

function LibraryPage() {
  return (
    <Flex render={<main />} direction="column" gap="3" p="6" style={{ maxWidth: "40rem" }}>
      <Heading level={1} size="3xl">
        Library
      </Heading>
    </Flex>
  );
}
