/**
 * The entry detail page's "Actions" menu — that it opens on click and its rows
 * drive the page. This is a real-browser test on purpose: the menu is baritone's
 * base-ui `Menu`, whose open/close is client behaviour, so it can only fail (or
 * pass) once the page is actually interactive. It also guards the regression it
 * was written for — a Node-only Prisma import reaching the browser bundle, which
 * crashed client bootstrap so *no* handler ever attached and every menu was dead.
 */
import { expect, test } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { db } from "#/mocks/db";
import { renderRoute } from "#/test/render-route";
import { Route } from "./_authenticated/entries/$entryId/index";

test("the Actions menu opens and Edit Text opens the edit drawer", async () => {
  const user = userEvent.setup();
  const { id } = db.entries[0];

  renderRoute(Route, {
    path: "/entries/$entryId",
    initialEntries: [`/entries/${id}`],
  });

  await user.click(await screen.findByRole("button", { name: "Actions" }));

  await user.click(await screen.findByRole("menuitem", { name: "Edit Text" }));

  await waitFor(() => {
    expect(screen.getByRole("heading", { name: "Edit text" })).toBeInTheDocument();
  });
});
