/**
 * New-entry route — the two-step create form.
 *
 * The form submits over oRPC (`entries.create`), answered here by the MSW mock,
 * which appends to `db.entries` just as the real API persists a row. The test
 * drives the default lyrics path end to end and asserts the payload the mock
 * received, so it verifies the form's field-to-contract mapping, not fixtures.
 */
import { expect, test, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderRoute } from "#/test/render-route";
import { db } from "#/mocks/db";
import { Route } from "./index";

test("saves a new lyrics entry via entries.create, then heads to the library", async () => {
  const user = userEvent.setup();
  const { router } = renderRoute(Route, {
    path: "/entries/new",
    initialEntries: ["/entries/new"],
  });

  await user.type(await screen.findByLabelText("Title"), "My Song");
  await user.type(screen.getByLabelText("Lyrics"), "First line\nSecond line");
  await user.click(screen.getByRole("button", { name: "Next" }));

  await user.type(await screen.findByLabelText("Artist"), "The Band");
  await user.type(screen.getByLabelText("Lyricist"), "A. Writer");
  await user.type(screen.getByLabelText("Album"), "The Record");
  await user.type(screen.getByLabelText("Year"), "2021");
  await user.click(screen.getByRole("button", { name: "Save entry" }));

  await vi.waitFor(() => {
    expect(db.entries[0]).toMatchObject({
      kind: "lyrics",
      title: "My Song",
      author: ["A. Writer"],
      artist: ["The Band"],
      album: "The Record",
      year: 2021,
      excerpt: "First line / Second line",
      lineCount: 2,
      wordCount: 4,
    });
  });

  await vi.waitFor(() => expect(router.state.location.pathname).toBe("/library"));
});
