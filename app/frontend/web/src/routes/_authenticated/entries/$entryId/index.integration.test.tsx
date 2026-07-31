import { expect, test, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route } from "./index";
import { renderRoute } from "#/test/render-route";
import { makeLongIslandEntry } from "#/test/mocks/fixtures";
import { observeSetAnnotations, seedEntry } from "#/test/mocks/handlers";

test("renders the fetched entry's details", async () => {
  // Seed the real "Long Island" demo entry (lyrics sourced from `.dummy/`).
  seedEntry(makeLongIslandEntry());

  renderRoute(Route, { path: "/entries/$entryId", initialEntries: ["/entries/1"] });

  // The <h1> is populated from data fetched through MSW → oRPC → the route loader.
  expect(await screen.findByRole("heading", { level: 1, name: "Long Island" })).toBeInTheDocument();

  // Byline (artist · year) renders as a single text node.
  expect(screen.getByText("Test Artist · 2024")).toBeInTheDocument();

  // The lyrics render into the workbench. In line mode each line is a checkbox
  // labelled by its text, so the second line is findable by its full text.
  expect(screen.getByText("I'd bike over to your house")).toBeInTheDocument();
});

test("assigns a rhyme group to a whole line", async () => {
  // Keep the seeded lyrics to derive the line's character span from.
  const { lyrics } = seedEntry(makeLongIslandEntry());

  // Spy on the exact batch payload the workbench sends the API.
  const setAnnotations = vi.fn();
  observeSetAnnotations(setAnnotations);

  // The workbench opens on the rhyme-scheme layer by default (see
  // WORKBENCH_SEARCH_DEFAULTS), so every non-blank line is a selectable checkbox.
  renderRoute(Route, { path: "/entries/$entryId", initialEntries: ["/entries/1"] });

  const user = userEvent.setup();
  await screen.findByRole("heading", { level: 1, name: "Long Island" });

  // Every non-blank line is its own checkbox, initially unchecked.
  const lineCount = lyrics.split("\n").filter((line) => line.trim().length > 0).length;
  expect(screen.getAllByRole("checkbox")).toHaveLength(lineCount);

  // Click anywhere on the first line to tick it — the word spans are inert, so
  // the click lands on the row. The inspector quotes the selected line.
  const firstLine = screen.getByRole("checkbox", { name: "If the world was ending" });
  await user.click(firstLine);
  expect(firstLine).toBeChecked();
  expect(await screen.findByText("“If the world was ending”")).toBeInTheDocument();

  // Assign rhyme group "A" from the grid.
  await user.click(screen.getByText("A").closest("button")!);

  // The line's badge now reports group A, and (selection cleared after the write)
  // the checkbox is unticked again, ready for the next group.
  expect(await screen.findByLabelText("Rhyme group A")).toHaveTextContent("A");
  expect(screen.getByRole("checkbox", { name: "If the world was ending" })).not.toBeChecked();

  // Exactly one batch write, carrying the whole first-line span (offsets derived
  // from the seeded lyrics, not hard-coded), value "A".
  const line = "If the world was ending";
  const start = lyrics.indexOf(line);
  expect(setAnnotations).toHaveBeenCalledTimes(1);
  expect(setAnnotations).toHaveBeenCalledWith({
    entryId: 1,
    mode: "rhyme-scheme",
    items: [{ startOffset: start, endOffset: start + line.length, value: "A", body: null }],
  });
});

test("assigns a rhyme group to several lines at once", async () => {
  const { lyrics } = seedEntry(makeLongIslandEntry());
  const setAnnotations = vi.fn();
  observeSetAnnotations(setAnnotations);

  renderRoute(Route, { path: "/entries/$entryId", initialEntries: ["/entries/1"] });

  const user = userEvent.setup();
  await screen.findByRole("heading", { level: 1, name: "Long Island" });

  // Tick two lines — no modifier needed, plain clicks accumulate.
  await user.click(screen.getByRole("checkbox", { name: "If the world was ending" }));
  await user.click(screen.getByRole("checkbox", { name: "Steal the bottle Dad's been saving" }));
  expect(await screen.findByText("2 lines")).toBeInTheDocument();

  // One click assigns "A" to both, in a single batch write.
  await user.click(screen.getByText("A").closest("button")!);

  const line1 = "If the world was ending";
  const line3 = "Steal the bottle Dad's been saving";
  const s1 = lyrics.indexOf(line1);
  const s3 = lyrics.indexOf(line3);
  expect(setAnnotations).toHaveBeenCalledTimes(1);
  expect(setAnnotations).toHaveBeenCalledWith({
    entryId: 1,
    mode: "rhyme-scheme",
    items: [
      { startOffset: s1, endOffset: s1 + line1.length, value: "A", body: null },
      { startOffset: s3, endOffset: s3 + line3.length, value: "A", body: null },
    ],
  });

  // Both lines carry group A now.
  expect(await screen.findAllByLabelText("Rhyme group A")).toHaveLength(2);
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
