/**
 * Annotate route — renders one saved piece as labelled section blocks beside the
 * sidebar's annotation-type picker. The entry comes over oRPC's `entries.get`,
 * answered here by the MSW mock.
 */
import { expect, test } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { splitSections } from "@rhymelab/api-contract";
import { renderRoute } from "#/test/render-route";
import { store } from "#/test/mocks/handlers";
import { Route } from "./index";

/** The first fixture entry, or a loud failure — every test needs one. */
function firstEntry() {
  const entry = store.entries[0];
  if (entry === undefined) throw new Error("expected a fixture entry");
  return entry;
}

/** Mount the annotate route for `entry`. */
function renderAnnotate(entryId: string) {
  return renderRoute(Route, {
    path: "/entries/$entryId/annotate",
    initialEntries: [`/entries/${entryId}/annotate`],
  });
}

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

test("shows the footer's actions only once an annotation tool is active", async () => {
  const entry = store.entries[0];
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

test("marking a line-end drives the unsaved-changes state; toggling it back is clean", async () => {
  const entry = firstEntry();
  const { container } = renderAnnotate(entry.id);

  expect(await screen.findByRole("heading", { level: 1, name: "Annotate" })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Enjambment" }));

  const footer = () => screen.getByRole("contentinfo");
  const saveButton = () => screen.getByRole("button", { name: "Save" });
  // Baritone models a disabled button as `aria-disabled` (kept focusable), not
  // the `disabled` attribute — so that's what we assert against.
  const firstTarget = () => {
    const target = container.querySelector<HTMLButtonElement>(".rl-enj-target");
    if (target === null) throw new Error("expected an enjambment target");
    return target;
  };

  // Nothing marked yet: the draft matches its baseline, so the footer reads clean
  // and the actions are inert.
  expect(within(footer()).getByText("All changes saved")).toBeInTheDocument();
  expect(saveButton()).toHaveAttribute("aria-disabled", "true");

  // Marking a line-end diverges the draft from its baseline.
  await userEvent.click(firstTarget());
  expect(within(footer()).getByText("Unsaved changes")).toBeInTheDocument();
  expect(saveButton()).not.toHaveAttribute("aria-disabled", "true");

  // Toggling the same line-end back off restores the baseline exactly (the marks
  // are compared by membership, so this is genuinely "no change" — not a sticky
  // dirty flag), and the footer returns to clean.
  await userEvent.click(firstTarget());
  expect(within(footer()).getByText("All changes saved")).toBeInTheDocument();
  expect(saveButton()).toHaveAttribute("aria-disabled", "true");
});

test("the final line of the piece is not a mark target", async () => {
  const entry = firstEntry();
  const { container } = renderAnnotate(entry.id);

  expect(await screen.findByRole("heading", { level: 1, name: "Annotate" })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Enjambment" }));

  // Every line is a target except the very last line of the whole piece, which
  // runs on into nothing — it renders as plain, un-clickable text.
  const sections = splitSections(entry.body);
  const totalLines = sections.reduce((sum, section) => sum + section.split("\n").length, 0);
  const lastLine = sections.at(-1)?.split("\n").at(-1);

  expect(container.querySelectorAll(".rl-enj-target")).toHaveLength(totalLines - 1);
  const statics = container.querySelectorAll(".rl-line-static");
  expect(statics).toHaveLength(1);
  expect(statics[0]?.textContent).toBe(lastLine);
});

test("switching tools with unsaved marks warns first — keep, or discard and switch", async () => {
  const entry = firstEntry();
  const { container } = renderAnnotate(entry.id);

  expect(await screen.findByRole("heading", { level: 1, name: "Annotate" })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Enjambment" }));

  const firstTarget = () => {
    const target = container.querySelector<HTMLButtonElement>(".rl-enj-target");
    if (target === null) throw new Error("expected an enjambment target");
    return target;
  };

  // Make an unsaved mark, then try to leave enjambment.
  await userEvent.click(firstTarget());
  await userEvent.click(screen.getByRole("button", { name: "Read" }));

  // The switch is intercepted: the confirm dialog shows and the mode is
  // unchanged. The open dialog makes the background inert (`aria-hidden`), so the
  // toggle is invisible to role queries — reach it through the container, which
  // ignores accessibility, to prove it's still the pressed tool.
  expect(await screen.findByText("Discard unsaved marks?")).toBeInTheDocument();
  const enjambmentToggle = [...container.querySelectorAll("button")].find(
    (button) => button.textContent?.trim() === "Enjambment",
  );
  expect(enjambmentToggle).toHaveAttribute("aria-pressed", "true");

  // "Keep editing" dismisses the dialog and leaves the draft intact.
  await userEvent.click(screen.getByRole("button", { name: "Keep editing" }));
  await waitFor(() => expect(screen.queryByText("Discard unsaved marks?")).not.toBeInTheDocument());
  expect(screen.getByRole("button", { name: "Enjambment" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(within(screen.getByRole("contentinfo")).getByText("Unsaved changes")).toBeInTheDocument();

  // Try again, this time confirming: the mode switches and the draft is discarded.
  await userEvent.click(screen.getByRole("button", { name: "Read" }));
  expect(await screen.findByText("Discard unsaved marks?")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Discard and switch" }));

  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Read" })).toHaveAttribute("aria-pressed", "true"),
  );
  // Read is passive — no footer — and re-entering enjambment shows a clean draft.
  expect(screen.queryByRole("contentinfo")).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Enjambment" }));
  expect(container.querySelectorAll('.rl-enj-target[aria-pressed="true"]')).toHaveLength(0);
});
