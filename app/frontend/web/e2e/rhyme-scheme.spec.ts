/**
 * Assigning a rhyme scheme to lines — the core workbench flow, driven against
 * the real running stack (web + API + Postgres) and signed in via the saved
 * session from `auth.setup.ts`.
 *
 * The entry page opens on the rhyme layer by default
 * (`WORKBENCH_SEARCH_DEFAULTS.mode === "rhyme-scheme"`), so the line rows and the
 * group grid are live without touching the mode picker.
 */
import { expect, test } from "@playwright/test";

test("assigns and reassigns a rhyme group to a pair of lines", async ({ page }) => {
  // Open a seeded entry from the library, located by its link text.
  await page.goto("/library");
  await page.getByRole("link", { name: "Long Island" }).click();

  // We land on the entry's workbench. The default mode/view are stripped from
  // the URL, so it's a clean `/entries/<id>` with no query string.
  await expect(page).toHaveURL(/\/entries\/\d+$/);
  // Let the client-rendered surface settle before driving it, so the first
  // toggle isn't fired before the row handlers are attached.
  await page.waitForLoadState("networkidle");

  // In rhyme mode each lyric line is a checkbox named by its own text; ticks
  // accumulate into one multi-line selection. Selection lives on the row, which
  // gets `data-line-selected` — a truer signal than the composite checkbox's own
  // state — so we click the checkbox but assert against its row.
  const houseLine = page.getByRole("checkbox", { name: "I'd bike over to your house" });
  const mouthLine = page.getByRole("checkbox", { name: "And kiss you on the mouth" });
  const lineRow = (text: string) => page.locator(".rl-line--rhyme", { hasText: text });
  const houseRow = lineRow("I'd bike over to your house");
  const mouthRow = lineRow("And kiss you on the mouth");

  // Tick each line, confirming the first registered before moving to the second.
  await houseLine.click();
  await expect(houseRow).toHaveAttribute("data-line-selected", "true");
  await mouthLine.click();
  await expect(mouthRow).toHaveAttribute("data-line-selected", "true");

  // The inspector confirms both lines are in one selection before we stamp a group.
  await expect(page.getByText("2 lines")).toBeVisible();

  // Each group is a segment of a `ToggleGroup`, named by its own `aria-label`
  // ("Rhyme group A, 2 lines") because the flattened swatch-plus-count text would
  // otherwise read as "A 2". Match on the letter alone so a changing count can't
  // break the locator.
  const groupButton = (letter: string) =>
    page.getByRole("button", { name: new RegExp(`^Rhyme group ${letter},`) });

  // Assigning writes the group to every selected line, then clears the
  // selection. This entry is shared across runs and may already carry a group
  // here, so this first assignment just normalises both lines to a known "A".
  await groupButton("A").click();
  await expect(houseRow).not.toHaveAttribute("data-line-selected", "true");

  // Reassign the same pair to a different group. Because the selection cleared,
  // re-tick both lines. They now share "A", so clicking "B" sets B (rather than
  // toggling A off) — a deterministic final state whatever the entry started at.
  await houseLine.click();
  await mouthLine.click();
  await expect(page.getByText("2 lines")).toBeVisible();
  await groupButton("B").click();

  // Each line's row now shows the group-B badge (role="img", labelled per
  // group). Scoping to each line's own row means a pre-existing "B" badge
  // elsewhere in the entry can't stand in for it.
  await expect(houseRow.getByRole("img", { name: "Rhyme group B" })).toBeVisible();
  await expect(mouthRow.getByRole("img", { name: "Rhyme group B" })).toBeVisible();
});
