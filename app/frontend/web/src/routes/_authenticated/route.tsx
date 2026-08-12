import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { NavBar } from "#/components/NavBar";
import { client } from "#/lib/orpc";

/**
 * The auth gate for everything under it. `beforeLoad` runs on the server for the
 * initial request and checks the session once; every nested route (`/home`, and
 * whatever the new UX adds) is protected by this single guard. The nav bar is
 * drawn here, so it's shared by every signed-in page rather than repeated per-page.
 */
export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async () => {
    const { authed } = await client.auth.me();
    if (!authed) throw redirect({ to: "/auth/login" });
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return (
    <>
      <NavBar />
      <Outlet />
    </>
  );
}
