import { expect, test } from "vitest";
import { screen } from "@testing-library/react";
import { Route } from "./index";
import { renderRoute } from "#/test/render-route";
import { makeEntryDetail } from "#/test/mocks/fixtures";
import { seedEntry } from "#/test/mocks/handlers";

test("renders the fetched entry's details", async () => {
  seedEntry(
    makeEntryDetail({
      id: 1,
      title: "Blackbird",
      artist: "The Beatles",
      year: 1968,
      kind: "song",
      lyrics: "Blackbird singing in the dead of night\nTake these broken wings and learn to fly",
    }),
  );

  renderRoute(Route, { path: "/entries/$entryId", initialEntries: ["/entries/1"] });

  // The <h1> is populated from data fetched through MSW → oRPC → the route loader.
  expect(await screen.findByRole("heading", { level: 1, name: "Blackbird" })).toBeInTheDocument();

  // Byline (artist · year) renders as a single text node.
  expect(screen.getByText("The Beatles · 1968")).toBeInTheDocument();

  // The lyrics render into the workbench (each word is its own selectable span).
  expect(screen.getByText("singing")).toBeInTheDocument();
});

test("renders a not-found state when the entry doesn't exist", async () => {
  // Nothing seeded, so `entries.get` resolves to null (a valid response, not an
  // error) and the page falls through to its missing-entry branch.
  renderRoute(Route, { path: "/entries/$entryId", initialEntries: ["/entries/999"] });

  expect(await screen.findByText("That entry doesn't exist")).toBeInTheDocument();
  expect(screen.getByText("It may have been deleted, or the link is wrong.")).toBeInTheDocument();

  // The workbench never mounts, so there's no entry title heading.
  expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
});
