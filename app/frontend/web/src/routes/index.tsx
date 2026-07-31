import { createFileRoute, redirect } from "@tanstack/react-router";
import { Flex, Heading, Link, Text } from "@saintly-software/baritone";
import { AlphaChip, BrandName } from "#/components/NavBar";
import { client } from "#/lib/orpc";

export const Route = createFileRoute("/")({
  // Signed in already? Straight to the library.
  beforeLoad: async () => {
    const { authed } = await client.auth.me();
    if (authed) throw redirect({ to: "/library" });
  },
  component: LandingPage,
});

function LandingPage() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "24px" }}>
      <Flex
        direction="column"
        align="center"
        gap="6"
        style={{ maxWidth: "34rem", textAlign: "center" }}
      >
        <Flex align="center" gap="3">
          <span className="rl-brand-dot" aria-hidden />
          <BrandName size="xl" />
          <AlphaChip style={{ borderColor: "var(--rl-hairline-strong)" }} />
        </Flex>

        <Heading level={1} size="8xl" font="serif" style={{ lineHeight: 1.04 }}>
          Read closely. Mark the music.
        </Heading>
        <Text size="lg" saliency="low">
          A private workbench for annotating songs and poems — rhyme structure, sound, theme,
          device, and notes, laid over the words themselves.
        </Text>

        <Link appearance="button" href="/library">
          Enter the lab
        </Link>
      </Flex>
    </main>
  );
}
