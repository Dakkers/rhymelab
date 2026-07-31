import { createFileRoute, redirect } from "@tanstack/react-router";
import { client } from "#/lib/orpc";

/**
 * Landing here signs you out. Useful as a plain URL — a link, a bookmark, or a
 * redirect target — where running a click handler isn't an option.
 *
 * The work happens in `beforeLoad` so the session cookie is cleared before
 * anything renders. Nothing is ever shown: the route always redirects to the
 * login page.
 *
 * Careful when linking here: the router preloads on intent, and a preload runs
 * `beforeLoad`. Use `<Link to="/auth/logout" preload={false}>` so hovering the
 * link doesn't sign the user out.
 */
export const Route = createFileRoute("/auth/logout/")({
  beforeLoad: async ({ context }) => {
    await client.auth.logout();
    // Everything cached was read as the signed-in user — drop it before the next
    // session can hydrate from it.
    context.queryClient.clear();
    throw redirect({ to: "/auth/login" });
  },
});
