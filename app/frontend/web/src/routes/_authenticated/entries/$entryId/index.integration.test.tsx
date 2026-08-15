/**
 * Entry detail route — renders a single saved piece, fetched over oRPC's
 * `entries.get`, answered here by the MSW mock.
 *
 * There's a test per `kind` rather than one test over `entries[0]`: the arm of
 * any given fixture is whatever zod-schema-faker happened to pick, so branching
 * on it inside a single test would leave whichever arm the seed didn't land on
 * permanently uncovered.
 */
import { expect, test } from "vitest";
import { screen } from "@testing-library/react";
import type { FakeEntry } from "@rhymelab/fixtures";
import { renderRoute } from "#/test/render-route";
import { db } from "#/mocks/db";
import { Route } from "./index";

/**
 * Mount the detail route for `entry` and assert the parts every kind renders the
 * same way. Returns once the page has painted, so callers can add their
 * arm-specific assertions synchronously.
 */
async function renderEntry(entry: FakeEntry): Promise<void> {
  renderRoute(Route, {
    path: "/entries/$entryId",
    initialEntries: [`/entries/${entry.id}`],
  });

  expect(await screen.findByRole("heading", { level: 1, name: entry.title })).toBeInTheDocument();
  expect(screen.getByText(entry.kind === "lyrics" ? "Lyrics" : "Poem")).toBeInTheDocument();
  // `body` is multi-line; match on exact textContent rather than a string
  // matcher, since RTL's default matcher normalizes embedded newlines to spaces.
  expect(
    screen.getByText((_content, element) => element?.textContent === entry.body),
  ).toBeInTheDocument();
}

test("renders a lyrics entry, with the performer and record in the byline", async () => {
  const entry = db.entries.find((candidate) => candidate.kind === "lyrics");
  // Narrows to the lyrics arm as well as asserting the fixtures cover it.
  if (entry?.kind !== "lyrics") throw new Error("expected a lyrics fixture entry");

  await renderEntry(entry);

  // Substring matches, never `new RegExp(...)`: these are generated names, and
  // interpolating them into a pattern would let their punctuation act as regex
  // syntax — "Mr. Foo" silently matching any character, "*NSYNC" throwing outright.
  expect(screen.getByText(entry.artist, { exact: false })).toBeInTheDocument();
  expect(screen.getByText(entry.album, { exact: false })).toBeInTheDocument();
});

test("renders a poem entry, with the author in the byline", async () => {
  const entry = db.entries.find((candidate) => candidate.kind === "poem");
  // Narrows to the poem arm as well as asserting the fixtures cover it.
  if (entry?.kind !== "poem") throw new Error("expected a poem fixture entry");

  await renderEntry(entry);

  expect(screen.getByText(entry.author, { exact: false })).toBeInTheDocument();
});

// NB: asserts the *current* behaviour — a loader that rejects with oRPC's
// NOT_FOUND surfaces TanStack Router's bare default error boundary, because the
// route never converts it into `notFound()`. The app's own NotFound component
// (wired at routes/__root.tsx and router.tsx) is unreachable from here. When
// that's fixed, this expectation should become the real "Page not found" copy.
test("surfaces the router's default error UI for an unknown id", async () => {
  renderRoute(Route, {
    path: "/entries/$entryId",
    initialEntries: ["/entries/00000000-0000-4000-8000-000000000000"],
  });

  expect(await screen.findByText("Not Found")).toBeInTheDocument();
});
