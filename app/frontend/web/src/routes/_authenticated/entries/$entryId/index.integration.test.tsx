/**
 * Entry detail route — renders a single saved piece, fetched over oRPC's
 * `entries.get`, answered here by the MSW mock.
 *
 * There's a test per `kind` rather than one test over `entries[0]`: the arm of
 * any given fixture is whatever zod-schema-faker happened to pick, so branching
 * on it inside a single test would leave whichever arm the seed didn't land on
 * permanently uncovered.
 */
import { expect, test, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { splitSections } from "@rhymelab/api-contract";
import type { FakeEntry } from "@rhymelab/fixtures";
import { names } from "#/lib/format";
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
  expectSectionsRendered(entry.body);
}

/**
 * Assert the body renders one row per line, grouped into labelled sections: every
 * line's text is on the page, and there's a section-type eyebrow per section. The
 * mock defaults every section's type to `verse` (`initStructure`), so each block
 * carries a "Verse" label. Lines are matched on exact `textContent` (the row's
 * inert lead plus its clickable end reconstruct the original line) rather than a
 * string matcher, since a selectable line is split across two child nodes.
 */
function expectSectionsRendered(body: string): void {
  const sections = splitSections(body);
  for (const line of sections.flatMap((section) => section.split("\n"))) {
    expect(
      screen.getAllByText((_content, element) => element?.textContent === line).length,
    ).toBeGreaterThan(0);
  }
  expect(screen.getAllByText("Verse")).toHaveLength(sections.length);
}

test("renders a lyrics entry, with the performer and record in the byline", async () => {
  const entry = db.entries.find((candidate) => candidate.kind === "lyrics");
  // Narrows to the lyrics arm as well as asserting the fixtures cover it.
  if (entry?.kind !== "lyrics") throw new Error("expected a lyrics fixture entry");

  await renderEntry(entry);

  // Substring matches, never `new RegExp(...)`: these are generated names, and
  // interpolating them into a pattern would let their punctuation act as regex
  // syntax — "Mr. Foo" silently matching any character, "*NSYNC" throwing outright.
  expect(screen.getByText(names(entry.artist), { exact: false })).toBeInTheDocument();
  expect(screen.getByText(entry.album, { exact: false })).toBeInTheDocument();
});

test("renders a poem entry, with the author in the byline", async () => {
  const entry = db.entries.find((candidate) => candidate.kind === "poem");
  // Narrows to the poem arm as well as asserting the fixtures cover it.
  if (entry?.kind !== "poem") throw new Error("expected a poem fixture entry");

  await renderEntry(entry);

  expect(screen.getByText(names(entry.author), { exact: false })).toBeInTheDocument();
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

test("deletes the piece from the Actions menu, once the confirmation is accepted", async () => {
  const user = userEvent.setup();
  const [entry] = db.entries;
  const { router } = renderRoute(Route, {
    path: "/entries/$entryId",
    initialEntries: [`/entries/${entry.id}`],
  });
  expect(await screen.findByRole("heading", { level: 1, name: entry.title })).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Actions" }));
  await user.click(await screen.findByRole("menuitem", { name: "Delete Entry" }));

  // Nothing is gone yet — the menu item only asks.
  const dialog = await screen.findByRole("dialog");
  expect(db.entries).toContain(entry);

  await user.click(within(dialog).getByRole("button", { name: "Delete Entry" }));

  await vi.waitFor(() => expect(db.entries).not.toContain(entry));
  // ...and the now-deleted page sends us back to the library.
  await vi.waitFor(() => expect(router.state.location.pathname).toBe("/library"));
});

test("keeps the piece when the confirmation is cancelled", async () => {
  const user = userEvent.setup();
  const [entry] = db.entries;
  renderRoute(Route, {
    path: "/entries/$entryId",
    initialEntries: [`/entries/${entry.id}`],
  });
  expect(await screen.findByRole("heading", { level: 1, name: entry.title })).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Actions" }));
  await user.click(await screen.findByRole("menuitem", { name: "Delete Entry" }));
  const dialog = await screen.findByRole("dialog");
  await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

  expect(db.entries).toContain(entry);
  expect(screen.getByRole("heading", { level: 1, name: entry.title })).toBeInTheDocument();
});

test("edits the text from the Actions menu, and shows the saved version on the page", async () => {
  const user = userEvent.setup();
  const [entry] = db.entries;
  renderRoute(Route, {
    path: "/entries/$entryId",
    initialEntries: [`/entries/${entry.id}`],
  });
  expect(await screen.findByRole("heading", { level: 1, name: entry.title })).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Actions" }));
  await user.click(await screen.findByRole("menuitem", { name: "Edit Text" }));

  const drawer = await screen.findByRole("dialog");
  const textbox = within(drawer).getByRole("textbox", { name: /text/i });
  expect(textbox).toHaveValue(entry.body);

  await user.clear(textbox);
  await user.type(textbox, "Rewritten words");
  await user.click(within(drawer).getByRole("button", { name: "Save" }));

  // The drawer closes on success, and the page shows the saved text — proof the
  // detail cache took the mutation's result rather than the stale loader data.
  await vi.waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(screen.getByText("Rewritten words")).toBeInTheDocument();
});

test("leaves the text alone when the edit drawer is cancelled", async () => {
  const user = userEvent.setup();
  const [entry] = db.entries;
  renderRoute(Route, {
    path: "/entries/$entryId",
    initialEntries: [`/entries/${entry.id}`],
  });
  expect(await screen.findByRole("heading", { level: 1, name: entry.title })).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Actions" }));
  await user.click(await screen.findByRole("menuitem", { name: "Edit Text" }));
  const drawer = await screen.findByRole("dialog");
  await user.type(within(drawer).getByRole("textbox", { name: /text/i }), " and more");
  await user.click(within(drawer).getByRole("button", { name: "Cancel" }));

  await vi.waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expectSectionsRendered(entry.body);
});

// A piece stored before body standardization existed still carries its raw text
// — ragged blank lines, trailing spaces. Opening its Edit drawer must not offer
// Save when nothing's been typed: the draft normalizes to what a save would
// already store, so the write would be a no-op. (Save compares the normalized
// draft against the *normalized* stored body, not the raw stored text.)
test("doesn't offer Save on open when the stored body only needs re-standardizing", async () => {
  const user = userEvent.setup();
  const entry = {
    ...db.entries[0],
    id: crypto.randomUUID(),
    title: "Ragged draft",
    body: "First line  \n\n\n  Second line ",
  };
  db.entries = [entry, ...db.entries];

  renderRoute(Route, {
    path: "/entries/$entryId",
    initialEntries: [`/entries/${entry.id}`],
  });
  expect(
    await screen.findByRole("heading", { level: 1, name: "Ragged draft" }),
  ).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Actions" }));
  await user.click(await screen.findByRole("menuitem", { name: "Edit Text" }));
  const drawer = await screen.findByRole("dialog");

  // Untouched, Save stays disabled — even though the raw draft isn't byte-equal
  // to the raw stored body. (Baritone soft-disables with `aria-disabled` rather
  // than the native attribute, so assert on that.)
  const saveButton = () => within(drawer).getByRole("button", { name: "Save" });
  expect(saveButton()).toHaveAttribute("aria-disabled", "true");

  // A genuine change to the text enables it.
  await user.type(within(drawer).getByRole("textbox", { name: /text/i }), " changed");
  expect(saveButton()).not.toHaveAttribute("aria-disabled", "true");
});

// The line-end is the enjambment click target: every line but the last (which has
// nothing to run on into) gets one, marking one flips its pressed state, and the
// marks read through the form as unsaved until Reset returns to the saved state.
test("marks a line as enjambed, tracks it as unsaved, and clears it on Reset", async () => {
  const user = userEvent.setup();
  const entry = {
    ...db.entries[0],
    id: crypto.randomUUID(),
    title: "Enjamb me",
    // One section, three lines — so two of the three line-ends are selectable.
    body: "one two\nthree four\nfive six",
  };
  db.entries = [entry, ...db.entries];

  renderRoute(Route, {
    path: "/entries/$entryId",
    initialEntries: [`/entries/${entry.id}`],
  });
  expect(await screen.findByRole("heading", { level: 1, name: "Enjamb me" })).toBeInTheDocument();

  // The final line ("five six") isn't a target, so only the first two lines'
  // ends are clickable.
  const ends = screen.getAllByRole("button", { name: /running on into the next/i });
  expect(ends).toHaveLength(2);

  // Nothing marked yet: no unsaved notice, and Reset is soft-disabled (Baritone
  // uses `aria-disabled` rather than the native attribute).
  expect(screen.queryByText("Unsaved marks")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Reset" })).toHaveAttribute("aria-disabled", "true");

  // Marking the first line's end presses it and surfaces the unsaved notice.
  await user.click(ends[0]);
  expect(ends[0]).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByText("Unsaved marks")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Reset" })).not.toHaveAttribute(
    "aria-disabled",
    "true",
  );

  // Reset returns to the saved (all-unmarked) state: the mark and the notice go.
  await user.click(screen.getByRole("button", { name: "Reset" }));
  expect(ends[0]).toHaveAttribute("aria-pressed", "false");
  expect(screen.queryByText("Unsaved marks")).not.toBeInTheDocument();
});
