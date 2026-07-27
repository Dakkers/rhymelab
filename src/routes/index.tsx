import { createFileRoute, redirect } from "@tanstack/react-router";
import { Flex, Link, Text } from "@saintly-software/baritone";
import { getAuth } from "#/server/auth";

export const Route = createFileRoute("/")({
  // Signed in already? Straight to the library.
  beforeLoad: async () => {
    const { authed } = await getAuth();
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
          <span className="rl-brand-name" style={{ fontSize: "1.4rem", color: "var(--rl-ink)" }}>
            RhymeLab
          </span>
          <span
            className="rl-chip-beta"
            style={{ color: "var(--rl-ink-soft)", borderColor: "var(--rl-hairline-strong)" }}
          >
            Alpha
          </span>
        </Flex>

        <h1 className="rl-title" style={{ fontSize: "2.8rem" }}>
          Read closely. Mark the music.
        </h1>
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
