/**
 * Annotate route — renders one saved piece as labelled section blocks beside the
 * sidebar's annotation-type picker. The entry comes over oRPC's `entries.get`,
 * answered here by the MSW mock.
 */
import { expect, test } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { splitSections } from "@rhymelab/api-contract";
import { renderRoute } from "#/test/render-route";
import { db } from "#/mocks/db";
import { Route } from "./index";

test("renders the entry's text as one labelled block per section", async () => {
  const entry = db.entries[0];
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
  const entry = db.entries[0];
  if (entry === undefined) throw new Error("expected a fixture entry");

  renderRoute(Route, {
    path: "/entries/$entryId/annotate",
    initialEntries: [`/entries/${entry.id}/annotate`],
  });

  expect(await screen.findByRole("heading", { level: 1, name: "Annotate" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Rhyme Scheme" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Enjambment" })).toBeInTheDocument();
});

test("shows the footer's actions only once an annotation tool is active", async () => {
  const entry = db.entries[0];
  if (entry === undefined) throw new Error("expected a fixture entry");

  renderRoute(Route, {
    path: "/entries/$entryId/annotate",
    initialEntries: [`/entries/${entry.id}/annotate`],
  });

  expect(await screen.findByRole("heading", { level: 1, name: "Annotate" })).toBeInTheDocument();

  // The page defaults to `read`, a passive view with nothing to save — no
  // footer. (`footer` carries the implicit `contentinfo` role.)
  expect(screen.queryByRole("contentinfo")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();

  // Switching to an annotation tool reveals the footer with its actions.
  await userEvent.click(screen.getByRole("button", { name: "Rhyme Scheme" }));
  expect(screen.getByRole("contentinfo")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Discard" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();

  // Back to `read` hides it again.
  await userEvent.click(screen.getByRole("button", { name: "Read" }));
  expect(screen.queryByRole("contentinfo")).not.toBeInTheDocument();
});
