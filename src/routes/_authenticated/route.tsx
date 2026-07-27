import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { getAuth } from "#/server/auth";

/**
 * The auth gate for everything under it. `beforeLoad` runs on the server for the
 * initial request and checks the session once; every nested route (`/library`,
 * `/entries/*`) is protected by this single guard. Chrome (the top bar) is drawn
 * per-page, not here, so each page can set its own bar context.
 */
export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async () => {
    const { authed } = await getAuth();
    if (!authed) throw redirect({ to: "/auth/login" });
  },
  component: Outlet,
});
