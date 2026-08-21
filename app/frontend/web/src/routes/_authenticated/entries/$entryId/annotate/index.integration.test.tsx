/**
 * Annotate route — renders one saved piece as labelled section blocks beside the
 * sidebar's annotation-type picker. The entry comes over oRPC's `entries.get`,
 * answered here by the MSW mock.
 */
import { expect, test } from "vitest";
import { screen } from "@testing-library/react";
import { splitSections } from "@rhymelab/api-contract";
import { renderRoute } from "#/test/render-route";
import { store } from "#/test/mocks/handlers";
import { Route } from "./index";

test("renders the entry's text as one labelled block per section", async () => {
  const entry = store.entries[0];
  if (entry === undefined) throw new Error("expected a fixture entry");

  renderRoute(Route, {
    path: "/entries/$entryId/annotate",
    initialEntries: [`/entries/${entry.id}/annotate`],
  });

  expect(await screen.findByRole("heading", { level: 1, name: "Annotate" })).toBeInTheDocument();

  // Sections are matched on exact `textContent` rather than a string matcher:
  // RTL's default normalizes embedded newlines to spaces, and a section is
  // itself multi-line. The mock defaults every section's type to `verse`
  // (`initStructure`), so each block carries a "Verse" label.
  const sections = splitSections(entry.body);
  for (const section of sections) {
    expect(
      screen.getAllByText((_content, element) => element?.textContent === section).length,
    ).toBeGreaterThan(0);
  }
  expect(screen.getAllByText("Verse")).toHaveLength(sections.length);
});

test("offers the annotation-type picker in the sidebar", async () => {
  const entry = store.entries[0];
  if (entry === undefined) throw new Error("expected a fixture entry");

  renderRoute(Route, {
    path: "/entries/$entryId/annotate",
    initialEntries: [`/entries/${entry.id}/annotate`],
  });

  expect(await screen.findByRole("heading", { level: 1, name: "Annotate" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Rhyme Scheme" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Enjambment" })).toBeInTheDocument();
});
