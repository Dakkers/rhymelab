/**
 * Annotate route — renders one saved piece as labelled section blocks beside the
 * sidebar's annotation-type picker. The entry comes over oRPC's `entries.get`,
 * answered here by the MSW mock.
 */
import { expect, test } from "vitest";
import { screen, waitFor } from "@testing-library/react";
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

test("the enjambment tool turns each line's tail into a run-on toggle", async () => {
  const entry = db.entries[0];
  if (entry === undefined) throw new Error("expected a fixture entry");

  const user = userEvent.setup();
  renderRoute(Route, {
    path: "/entries/$entryId/annotate",
    initialEntries: [`/entries/${entry.id}/annotate`],
  });

  await user.click(await screen.findByRole("button", { name: "Enjambment" }));

  // One tail target per line except the very last — the final line has nothing
  // to run on into, so it stays plain text (never a button).
  const lineCount = splitSections(entry.body).reduce((n, s) => n + s.split("\n").length, 0);
  const tails = screen.getAllByRole("button", { name: /enjambment after/i });
  expect(tails).toHaveLength(lineCount - 1);

  // The fixture seeds one enjambment on the first content pair, so the first
  // line's tail starts pressed; clicking it toggles the run-on off.
  const first = tails[0];
  if (first === undefined) throw new Error("expected a tail target");
  expect(first).toHaveAttribute("aria-pressed", "true");
  await user.click(first);
  expect(first).toHaveAttribute("aria-pressed", "false");
});

test("Save and Discard stay disabled until the draft changes", async () => {
  const entry = db.entries[0];
  if (entry === undefined) throw new Error("expected a fixture entry");

  const user = userEvent.setup();
  renderRoute(Route, {
    path: "/entries/$entryId/annotate",
    initialEntries: [`/entries/${entry.id}/annotate`],
  });

  await user.click(await screen.findByRole("button", { name: "Enjambment" }));

  // Nothing edited yet — the draft matches what's stored, so both actions are
  // inert. Baritone disables via `aria-disabled` (the control stays focusable),
  // not the native `disabled` attribute.
  expect(screen.getByRole("button", { name: "Save" })).toHaveAttribute("aria-disabled", "true");
  expect(screen.getByRole("button", { name: "Discard" })).toHaveAttribute("aria-disabled", "true");

  const tails = screen.getAllByRole("button", { name: /enjambment after/i });
  const first = tails[0];
  if (first === undefined) throw new Error("expected a tail target");
  await user.click(first);

  expect(screen.getByRole("button", { name: "Save" })).not.toHaveAttribute("aria-disabled", "true");
  expect(screen.getByRole("button", { name: "Discard" })).not.toHaveAttribute(
    "aria-disabled",
    "true",
  );
});

test("switching tools with unsaved marks warns before discarding them", async () => {
  const entry = db.entries[0];
  if (entry === undefined) throw new Error("expected a fixture entry");

  const user = userEvent.setup();
  renderRoute(Route, {
    path: "/entries/$entryId/annotate",
    initialEntries: [`/entries/${entry.id}/annotate`],
  });

  await user.click(await screen.findByRole("button", { name: "Enjambment" }));

  const first = screen.getAllByRole("button", { name: /enjambment after/i })[0];
  if (first === undefined) throw new Error("expected a tail target");
  await user.click(first); // draft now differs from what's saved
  expect(first).toHaveAttribute("aria-pressed", "false");

  // Trying to leave the tool raises the guard rather than switching outright.
  await user.click(screen.getByRole("button", { name: "Read" }));
  expect(
    await screen.findByRole("heading", { name: "Discard unsaved marks?" }),
  ).toBeInTheDocument();

  // Cancel keeps us in the tool with the edit intact (wait out the dialog's
  // exit transition before checking it's gone).
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  await waitFor(() =>
    expect(
      screen.queryByRole("heading", { name: "Discard unsaved marks?" }),
    ).not.toBeInTheDocument(),
  );
  expect(screen.getAllByRole("button", { name: /enjambment after/i })[0]).toHaveAttribute(
    "aria-pressed",
    "false",
  );

  // Discarding reverts the draft and completes the switch to the read view.
  await user.click(screen.getByRole("button", { name: "Read" }));
  await user.click(await screen.findByRole("button", { name: "Discard and switch" }));
  await waitFor(() => expect(screen.queryByRole("contentinfo")).not.toBeInTheDocument());
});
