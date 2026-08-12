import { createFileRoute } from "@tanstack/react-router";
import { Flex, Heading, Text } from "@saintly-software/baritone";

/**
 * Placeholder signed-in home. The product surface (library / workbench) was
 * removed while the UX is redesigned from the ground up; this keeps the
 * authenticated shell (guard + nav) rendering somewhere and gives login a
 * destination. Replace it with the new home once the UX is settled.
 */
export const Route = createFileRoute("/_authenticated/home/")({
  component: HomePage,
});

function HomePage() {
  return (
    <Flex render={<main />} direction="column" gap="3" p="6" style={{ maxWidth: "40rem" }}>
      <Heading level={1} size="3xl">
        Home
      </Heading>
      <Text saliency="low">
        The workbench is being rebuilt. Nothing to see here yet — this is the signed-in shell the
        new UX will hang off of.
      </Text>
    </Flex>
  );
}
