/**
 * `RouteError` picks the page a thrown route error renders as. That dispatch
 * is our logic (oRPC and TanStack Router are assumed to work), so it's what's
 * worth pinning: an oRPC `NOT_FOUND` gets the friendly not-found copy,
 * everything else falls through to the generic error page with a working
 * retry. Uses `renderComponent`, not `renderRoute` — `RouteError` takes its
 * error as a prop rather than one thrown from a loader, so no router is
 * needed to exercise it.
 */
import { expect, test, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ORPCError } from "@orpc/client";
import { renderComponent } from "#/test/render-component";
import { RouteError } from "./index";

test("renders the not-found page for an oRPC NOT_FOUND error", () => {
  renderComponent(<RouteError error={new ORPCError("NOT_FOUND")} reset={vi.fn()} />);

  expect(screen.getByRole("heading", { name: "Not found" })).toBeInTheDocument();
});

test("renders the generic error page for anything else, and reset() rewires the retry button", async () => {
  const user = userEvent.setup();
  const reset = vi.fn();
  renderComponent(<RouteError error={new Error("boom")} reset={reset} />);

  expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Try again" }));
  expect(reset).toHaveBeenCalledOnce();
});

test("an ORPCError with a different code still renders the generic error page", () => {
  renderComponent(<RouteError error={new ORPCError("UNAUTHORIZED")} reset={vi.fn()} />);

  expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeInTheDocument();
});
