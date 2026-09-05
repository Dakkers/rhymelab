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
 * Assert the body renders as one labelled block per section: every section's
 * text is on the page, and there's a section-type eyebrow for each. The mock
 * defaults every section's type to `verse` (`initStructure`), so each block
 * carries a "Verse" label. Sections are matched on exact `textContent` rather
 * than a string matcher, since RTL's default normalizes embedded newlines to
 * spaces and a section is itself multi-line.
 */
function expectSectionsRendered(body: string): void {
  const sections = splitSections(body);
  for (const section of sections) {
    expect(
      screen.getAllByText((_content, element) => element?.textContent === section).length,
    ).toBeGreaterThan(0);
  }
  expect(screen.getAllByText("Verse")).toHaveLength(sections.length);
}

test("renders a lyrics entry, with the performer and record in the byline", async () => {
  const entry = db.entries.find((candidate) => candidate.kind === "lyrics");
  if (entry?.kind !== "lyrics") throw new Error("expected a lyrics fixture entry");

  await renderEntry(entry);

  expect(screen.getByText(names(entry.artist), { exact: false })).toBeInTheDocument();
  expect(screen.getByText(entry.album, { exact: false })).toBeInTheDocument();
});

test("renders a poem entry, with the author in the byline", async () => {
  const entry = db.entries.find((candidate) => candidate.kind === "poem");
  if (entry?.kind !== "poem") throw new Error("expected a poem fixture entry");

  await renderEntry(entry);

  expect(screen.getByText(names(entry.author), { exact: false })).toBeInTheDocument();
});

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

  const dialog = await screen.findByRole("dialog");
  expect(db.entries).toContain(entry);

  await user.click(within(dialog).getByRole("button", { name: "Delete Entry" }));

  await vi.waitFor(() => expect(db.entries).not.toContain(entry));
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

  const saveButton = () => within(drawer).getByRole("button", { name: "Save" });
  expect(saveButton()).toHaveAttribute("aria-disabled", "true");

  await user.type(within(drawer).getByRole("textbox", { name: /text/i }), " changed");
  expect(saveButton()).not.toHaveAttribute("aria-disabled", "true");
});
