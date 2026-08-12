/**
 * Library route — renders the signed-in user's saved entries.
 *
 * The route's loader reads the stubbed `listEntries()` directly (no HTTP), so
 * this mounts the real route via `renderRoute` and asserts the stub rows land as
 * a list of cards. Swap these expectations for MSW-backed ones when the entries
 * procedure joins the contract.
 */
import { expect, test } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderRoute } from "#/test/render-route";
import { Route } from "./index";

test("lists the user's saved entries as titled cards", async () => {
  renderRoute(Route, { path: "/library", initialEntries: ["/library"] });

  // The page title.
  expect(await screen.findByRole("heading", { level: 1, name: "Library" })).toBeInTheDocument();

  // Every stub piece shows up in the named list, one card each.
  const list = screen.getByRole("list", { name: "Saved pieces" });
  const items = within(list).getAllByRole("listitem");
  expect(items).toHaveLength(5);

  // A lyrics row carries its title, kind, byline (artist · album · year), and
  // stats (lines / words / writer).
  const card = within(list).getByText("Midnight Static").closest("li")!;
  expect(within(card).getByText("Lyrics")).toBeInTheDocument();
  expect(within(card).getByText(/Neon Liturgy/)).toBeInTheDocument();
  expect(within(card).getByText(/2023/)).toBeInTheDocument();
  expect(within(card).getByText("42 lines")).toBeInTheDocument();
  expect(within(card).getByText("287 words")).toBeInTheDocument();
  expect(within(card).getByText("Words by Nora Vance")).toBeInTheDocument();
});

test("a poem row omits the lyrics-only byline fields", async () => {
  renderRoute(Route, { path: "/library", initialEntries: ["/library"] });

  const list = await screen.findByRole("list", { name: "Saved pieces" });
  const card = within(list).getByText("Paper Boats").closest("li")!;

  expect(within(card).getByText("Poem")).toBeInTheDocument();
  // Byline is author · year — no album, and the writer isn't repeated in the stats.
  expect(within(card).getByText(/Elena Marsh · 2019/)).toBeInTheDocument();
  expect(within(card).queryByText(/Words by/)).not.toBeInTheDocument();
});

test("orders entries newest-edited first", async () => {
  renderRoute(Route, { path: "/library", initialEntries: ["/library"] });

  const list = await screen.findByRole("list", { name: "Saved pieces" });
  const headings = within(list)
    .getAllByRole("heading")
    .map((h) => h.textContent);

  expect(headings).toEqual([
    "Midnight Static",
    "Paper Boats",
    "Concrete Orchard",
    "Low Tide Letters",
    "Borrowed Weather",
  ]);
});
