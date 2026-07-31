import { expect, test, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route } from "./index";
import { renderRoute } from "#/test/render-route";
import { makeLongIslandEntry } from "#/test/mocks/fixtures";
import { observeSetAnnotation, seedEntry } from "#/test/mocks/handlers";

test("renders the fetched entry's details", async () => {
  // Seed the real "Long Island" demo entry (lyrics sourced from `.dummy/`).
  seedEntry(makeLongIslandEntry());

  renderRoute(Route, { path: "/entries/$entryId", initialEntries: ["/entries/1"] });

  // The <h1> is populated from data fetched through MSW → oRPC → the route loader.
  expect(await screen.findByRole("heading", { level: 1, name: "Long Island" })).toBeInTheDocument();

  // Byline (artist · year) renders as a single text node.
  expect(screen.getByText("Test Artist · 2024")).toBeInTheDocument();

  // The lyrics render into the workbench (each word is its own selectable span).
  // "bike" occurs once in the demo lyrics, so exactly one span carries it.
  expect(screen.getByText("bike")).toBeInTheDocument();
});

test("assigns a rhyme group to the last word of a line", async () => {
  // The demo's first line ("If the world was ending") ends on "ending" — the
  // word we select and annotate. Keep the seeded lyrics to derive offsets from.
  const { lyrics } = seedEntry(makeLongIslandEntry());

  // Spy on the exact payload the workbench sends the API for the assignment.
  const setAnnotation = vi.fn();
  observeSetAnnotation(setAnnotation);

  // The workbench opens on the rhyme-scheme layer by default (see
  // WORKBENCH_SEARCH_DEFAULTS), so words are already selectable and assigning a
  // group needs no mode switch.
  renderRoute(Route, { path: "/entries/$entryId", initialEntries: ["/entries/1"] });

  const user = userEvent.setup();

  // 1. The entry rendered: its lyrics are split into selectable word spans.
  await screen.findByRole("heading", { level: 1, name: "Long Island" });
  const lastWord = screen.getByText("ending");

  // Nothing is annotated yet: the word carries no highlight and every non-blank
  // line offers an empty "+" badge (one per line) rather than a group letter.
  const lineCount = lyrics.split("\n").filter((line) => line.trim().length > 0).length;
  expect(lastWord).not.toHaveAttribute("data-annot");
  expect(screen.getAllByLabelText("Assign rhyme group to this line")).toHaveLength(lineCount);

  // 2. Click the last word of the first line to select it. The inspector then
  // reflects the selection and reveals the rhyme-group grid.
  await user.click(lastWord);
  expect(await screen.findByText("“ending”")).toBeInTheDocument();

  // 3. Assign rhyme group "A". The grid buttons label their swatch with the
  // group letter; click A's.
  const groupButton = screen.getByText("A").closest("button");
  expect(groupButton).not.toBeNull();
  await user.click(groupButton!);

  // The write round-trips through MSW → oRPC → the store, and invalidation
  // refetches the entry. The line's badge now reports group A…
  const badge = await screen.findByLabelText("Rhyme group A");
  expect(badge).toHaveTextContent("A");

  // The spy caught exactly one write, carrying group "A" over the character span
  // of "ending" (offsets derived from the seeded lyrics, not hard-coded). The
  // first line's "ending" is the first occurrence of that substring, so
  // `indexOf` lands on the very word we selected.
  const start = lyrics.indexOf("ending");
  expect(setAnnotation).toHaveBeenCalledTimes(1);
  expect(setAnnotation).toHaveBeenCalledWith({
    entryId: 1,
    mode: "rhyme-scheme",
    startOffset: start,
    endOffset: start + "ending".length,
    value: "A",
    body: null,
  });

  // …that line now shows group A, so one fewer "+" add-badge remains, and the
  // selected word is highlighted.
  expect(screen.getAllByLabelText("Assign rhyme group to this line")).toHaveLength(lineCount - 1);
  expect(screen.getByText("ending")).toHaveAttribute("data-annot", "true");

  // The inspector's cross-mode summary confirms the rhyme-scheme annotation.
  // (Locate the card by its unique "Clear" button rather than the mode label,
  // which also appears in the mode bar and the panel header.)
  const summary = screen.getByLabelText("Clear Rhyme scheme").closest(".rl-assign-card");
  expect(summary).not.toBeNull();
  expect(within(summary as HTMLElement).getByText("A")).toBeInTheDocument();
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
