/**
 * Assigning a rhyme group to a line — driven against the real running stack
 * (web + API + Postgres), already signed in from the saved session.
 *
 * Each non-blank line is a checkbox (click anywhere on the row to tick it); the
 * inspector's grid then stamps a group onto every ticked line, and assigning
 * clears the selection. Group letters render as `role="img"` badges on the right.
 *
 * The demo "Long Island" entry is shared, mutable dev data, so this test cleans
 * up after itself: it assigns a group, verifies it landed, then re-selects the
 * same line and toggles it back off, leaving the entry exactly as it found it.
 */
import { expect, test } from "@playwright/test";

test("assigns a rhyme group to a line, then clears it", async ({ page }) => {
  // Start in the library and open the demo entry the recording used. The card is
  // a link whose accessible name carries the entry title.
  await page.goto("/library");
  await page.getByRole("link", { name: /Long Island/i }).click();

  // We're on the entry's workbench: the URL carries an entry id and the <h1> is
  // the title. The workbench opens on the rhyme-scheme layer by default, so
  // lines are immediately selectable without switching modes.
  await expect(page).toHaveURL(/\/entries\/\d+/);
  await expect(page.getByRole("heading", { level: 1, name: "Long Island" })).toBeVisible();

  // Pick a line that isn't grouped yet — its row (a checkbox) holds no group
  // letter. Capture its name so we can re-select the exact same line to clean up.
  const ungrouped = page
    .getByRole("checkbox")
    .filter({ hasNot: page.locator("[aria-label^='Rhyme group']") });
  const target = ungrouped.first();
  const lineName = await target.getAttribute("aria-label");
  expect(lineName).toBeTruthy();

  // Count the group-A line badges so we can prove exactly one appears (and later
  // disappears) without depending on a fixed number the shared entry may carry.
  const aBadges = page.getByLabel("Rhyme group A");
  const aBefore = await aBadges.count();

  // The grid buttons expose no accessible name of their own (aria-hidden swatch),
  // so locate group A by its visible letter — scoped to the inspector (the <aside>
  // = the complementary landmark) so it can't collide with an "A" line badge.
  const inspector = page.getByRole("complementary");
  const groupA = inspector.getByRole("button").filter({ hasText: "A" });

  // Tick the line to open the rhyme-group grid. `server.warmup` in vite.config
  // pre-optimizes this route's deps at startup, so the first-visit dep-optimize
  // reload that would wipe an early click shouldn't fire. This retry is a cheap
  // safety net for the cold-cache edge (fresh CI checkout, changed deps).
  await expect(async () => {
    await target.click();
    await expect(groupA).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20_000 });

  // Assign group A. The batch write round-trips through the API and the entry
  // refetches: the line gains an "A" badge, and assigning clears the selection.
  await groupA.click();
  await expect(aBadges).toHaveCount(aBefore + 1);

  // Clean up: re-select that same line (now group A, so the grid shows A active)
  // and click A again to toggle it back off, leaving the entry as we found it.
  await page.getByRole("checkbox", { name: lineName! }).first().click();
  await expect(groupA).toBeVisible();
  await groupA.click();
  await expect(aBadges).toHaveCount(aBefore);
});
