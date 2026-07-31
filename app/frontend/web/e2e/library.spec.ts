/**
 * Example end-to-end spec — and the house style for anything the recorder
 * produces. It runs against the real running stack (web + API + Postgres),
 * already signed in via the saved session from `auth.setup.ts`.
 *
 * What "recorder output, cleaned up" looks like: role/label locators instead of
 * generated CSS/nth-child selectors, and real `expect`s (codegen writes almost
 * none). Delete or rewrite this once you've recorded your own flows.
 */
import { expect, test } from "@playwright/test";

test("library is reachable while signed in", async ({ page }) => {
  await page.goto("/library");

  // The auth guard let us through rather than bouncing us to the landing page:
  // we're actually on /library, not redirected away.
  await expect(page).toHaveURL(/\/library$/);

  // The signed-in chrome renders: the NavBar brand links home. Located by its
  // accessible name, which is stable across styling changes.
  await expect(page.getByRole("link", { name: /RhymeLab/i })).toBeVisible();

  // The page's own title renders (the library's <h1>).
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
