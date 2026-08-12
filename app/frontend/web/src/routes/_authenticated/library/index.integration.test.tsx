/**
 * Library route — renders the signed-in user's saved entries.
 *
 * The loader calls `client.entries.list()` over oRPC, answered here by the MSW
 * mock. The mock's rows are generated (`@rhymelab/fixtures`) rather than
 * hand-written, so the assertions read expectations off `store.entries` instead
 * of hard-coding titles — the test verifies the rendering, not specific fixtures.
 */
import { expect, test } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderRoute } from "#/test/render-route";
import { store } from "#/test/mocks/handlers";
import { Route } from "./index";

/** The order the Library should render: newest-edited first. */
const newestFirst = [...store.entries].sort(
  (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
);

test("renders every saved entry as a card, newest-edited first", async () => {
  renderRoute(Route, { path: "/library", initialEntries: ["/library"] });

  expect(await screen.findByRole("heading", { level: 1, name: "Library" })).toBeInTheDocument();

  const list = screen.getByRole("list", { name: "Saved pieces" });
  expect(within(list).getAllByRole("listitem")).toHaveLength(store.entries.length);

  const headings = within(list)
    .getAllByRole("heading")
    .map((h) => h.textContent);
  expect(headings).toEqual(newestFirst.map((entry) => entry.title));
});

test("each card shows its kind, byline, and stats", async () => {
  // The generated fixtures cover both arms, so both rendering paths get exercised.
  expect(store.entries.some((entry) => entry.kind === "lyrics")).toBe(true);
  expect(store.entries.some((entry) => entry.kind === "poem")).toBe(true);

  renderRoute(Route, { path: "/library", initialEntries: ["/library"] });
  const list = await screen.findByRole("list", { name: "Saved pieces" });

  for (const entry of store.entries) {
    const card = within(list).getByRole("heading", { name: entry.title }).closest("li")!;
    const text = card.textContent ?? "";

    expect(within(card).getByText(entry.kind === "lyrics" ? "Lyrics" : "Poem")).toBeInTheDocument();
    if (entry.year !== undefined) expect(text).toContain(String(entry.year));
    expect(text).toContain(String(entry.lineCount));
    expect(text).toContain(String(entry.wordCount));

    if (entry.kind === "lyrics") {
      // Byline is artist · album · year; the writer is surfaced in the stats.
      expect(text).toContain(entry.artist);
      expect(text).toContain(entry.album);
      expect(within(card).getByText(`Words by ${entry.author}`)).toBeInTheDocument();
    } else {
      // Byline is author · year; no album, and the writer isn't repeated.
      expect(text).toContain(entry.author);
      expect(within(card).queryByText(/Words by/)).not.toBeInTheDocument();
    }
  }
});
