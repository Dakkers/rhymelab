/**
 * Entry detail route — renders a single saved piece, fetched over oRPC's
 * `entries.get`, answered here by the MSW mock.
 */
import { expect, test } from "vitest";
import { screen } from "@testing-library/react";
import { renderRoute } from "#/test/render-route";
import { store } from "#/test/mocks/handlers";
import { Route } from "./index";

test("renders the entry's title, byline, kind, and body", async () => {
  const [entry] = store.entries;
  if (!entry) throw new Error("expected at least one fixture entry");

  renderRoute(Route, {
    path: "/entries/$entryId",
    initialEntries: [`/entries/${entry.id}`],
  });

  expect(await screen.findByRole("heading", { level: 1, name: entry.title })).toBeInTheDocument();
  expect(screen.getByText(entry.kind === "lyrics" ? "Lyrics" : "Poem")).toBeInTheDocument();
  // The mock stands the excerpt in for the not-yet-fixtured `body`.
  expect(screen.getByText(entry.excerpt)).toBeInTheDocument();

  if (entry.kind === "lyrics") {
    expect(screen.getByText(new RegExp(entry.artist))).toBeInTheDocument();
  } else {
    expect(screen.getByText(new RegExp(entry.author))).toBeInTheDocument();
  }
});

test("renders the router's default not-found UI for an unknown id", async () => {
  renderRoute(Route, {
    path: "/entries/$entryId",
    initialEntries: ["/entries/00000000-0000-4000-8000-000000000000"],
  });

  expect(await screen.findByText("Not Found")).toBeInTheDocument();
});
