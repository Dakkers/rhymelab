import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { Button, Card, Flex, Heading, Text, TextInput } from "@saintly-software/baritone";
import { BrandName } from "#/components/NavBar";
import { client } from "#/lib/orpc";

export const Route = createFileRoute("/auth/login/")({
  // Already signed in? Skip the form.
  beforeLoad: async () => {
    const { authed } = await client.auth.me();
    if (authed) throw redirect({ to: "/library" });
  },
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [password, setPassword] = useState("");
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      const result = await client.auth.login({ password });
      if (result.ok) {
        // Anything cached was read as the signed-out user; drop it so the next
        // session doesn't hydrate from a stale cache.
        queryClient.clear();
        await navigate({ to: "/library" });
      } else {
        setFailed(true);
        setBusy(false);
      }
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  return (
    <Flex render={<main />} align="center" justify="center" p="6" style={{ minHeight: "100vh" }}>
      <Card saliency="low" style={{ width: 380 }}>
        <Flex render={<form onSubmit={submit} />} direction="column" gap="4">
          <Flex align="center" gap="3">
            <span className="rl-brand-dot" aria-hidden />
            <BrandName />
          </Flex>
          <Flex direction="column" gap="1">
            <Heading level={2} size="xl">
              Welcome back
            </Heading>
            <Text size="sm" saliency="low">
              Enter the password to open the app.
            </Text>
          </Flex>
          <TextInput
            label="Password"
            type="password"
            value={password}
            onChange={(value) => setPassword(value)}
            state={failed ? "invalid" : "neutral"}
            helpText={failed ? "That password didn't match." : undefined}
            autoFocus
          />
          <Button type="submit" loading={busy}>
            Log in
          </Button>
        </Flex>
      </Card>
    </Flex>
  );
}
