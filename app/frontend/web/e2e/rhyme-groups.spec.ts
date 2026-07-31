/**
 * Assigning a rhyme group to a line — driven against the real running stack
 * (web + API + Postgres), already signed in from the saved session.
 *
 * Refined from raw codegen. The recorder produced a long run of positional
 * `.first()`/`.nth()` clicks against the inspector's group grid, named by number
 * (`getByRole("button", { name: "1" })`) or by concatenated text (`"X0"`) —
 * because the grid's swatch letters are `aria-hidden`, so the only accessible
 * name codegen could see was each group's running count. Those are replaced here
 * with role/label locators and real assertions on the resulting state.
 *
 * The demo "Long Island" entry is shared, mutable dev data, so this test cleans
 * up after itself: it assigns a group, verifies it landed, then toggles it back
 * off, leaving the entry exactly as it found it (and re-runnable).
 */
import { expect, test } from "@playwright/test";

test("assigns a rhyme group to a line, then clears it", async ({ page }) => {
  // Start in the library and open the demo entry the recording used. The card is
  // a link whose accessible name carries the entry title.
  await page.goto("/library");
  await page.getByRole("link", { name: /Long Island/i }).click();

  // We're on the entry's workbench: the URL carries an entry id and the <h1> is
  // the title. The workbench opens on the rhyme-structure layer by default, so
  // lines are immediately assignable without switching modes.
  await expect(page).toHaveURL(/\/entries\/\d+/);
  await expect(page.getByRole("heading", { level: 1, name: "Long Island" })).toBeVisible();

  // Every not-yet-grouped line shows a "+" add-badge. Track the set so we can
  // watch its size change: one badge disappears when a line gains a group and
  // reappears when it's cleared. Counting badges (rather than asserting a fixed
  // number) keeps the test robust to groups the shared entry may already carry.
  const addBadges = page.getByRole("button", { name: "Assign rhyme group to this line" });
  const before = await addBadges.count();
  expect(before).toBeGreaterThan(0);

  // The grid buttons expose no accessible name of their own (aria-hidden swatch),
  // so locate group A by its visible letter — scoped to the inspector (the <aside>
  // = the complementary landmark) so it can't collide with an "A" line badge the
  // entry may already show elsewhere.
  const inspector = page.getByRole("complementary");
  const groupA = inspector.getByRole("button").filter({ hasText: "A" });

  // Click the first add-badge to select that line's final word, which opens the
  // rhyme-group grid. `server.warmup` in vite.config pre-optimizes this route's
  // deps at startup, so the first-visit dep-optimization reload that would
  // otherwise wipe an early click shouldn't fire. This retry is a cheap safety
  // net for the cold-cache edge (fresh CI checkout, changed deps): if such a
  // reload ever does land mid-click, re-select until it sticks.
  await expect(async () => {
    await addBadges.first().click();
    await expect(groupA).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20_000 });

  // Assign group A. The write round-trips through the API and the entry refetches:
  // the line's badge flips from "+" to a group, so one fewer add-badge remains…
  await groupA.click();
  await expect(addBadges).toHaveCount(before - 1);
  // …and the inspector's cross-mode summary now offers to clear the rhyme-structure
  // annotation — proof the group actually landed on the selected span.
  await expect(inspector.getByLabel("Clear Rhyme structure")).toBeVisible();

  // Clean up: clicking the already-active group toggles it back off, so the line
  // returns to a "+" and the entry is left exactly as we found it.
  await groupA.click();
  await expect(addBadges).toHaveCount(before);
  await expect(inspector.getByLabel("Clear Rhyme structure")).toBeHidden();
});
