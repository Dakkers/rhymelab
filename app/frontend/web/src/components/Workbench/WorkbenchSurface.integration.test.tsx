import { useState } from "react";
import { beforeAll, describe, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useSuspenseQuery } from "@tanstack/react-query";
import { defaultSectionLabel, detectSections, type RhymeView } from "@rhymelab/core";
import type { EntryDetail, SectionDTO } from "@rhymelab/api-contract";
import { WorkbenchSurface } from "./WorkbenchSurface";
import { q } from "#/lib/queries";
import { renderComponent } from "#/test/render-component";
import { makeLongIslandEntry } from "#/test/mocks/fixtures";
import { seedEntry } from "#/test/mocks/handlers";

/**
 * Mounts the surface on its own, deliberately without the page chrome the route
 * wraps it in (no title, no structure notice). It subscribes to the same entry
 * query the real page does, so a write's `invalidateEntry` flows back through
 * here and re-renders the surface — exactly as it would in the app.
 */
function Harness({ entryId }: { entryId: number }) {
  const [view, setView] = useState<RhymeView>("colours");
  const { data: entry } = useSuspenseQuery(q.entries.detail(entryId));
  if (!entry) return null;
  return <WorkbenchSurface entry={entry} view={view} onViewChange={setView} />;
}

/**
 * The demo entry with its stanzas split into real sections (the backend does this
 * split; the fixture ships none), so the surface renders one card per section.
 */
function makeSectionedEntry(overrides: Partial<EntryDetail> = {}): EntryDetail {
  const entry = makeLongIslandEntry(overrides);
  const sections: SectionDTO[] = detectSections(entry.lyrics).map((s) => ({
    id: s.orderIndex + 1,
    orderIndex: s.orderIndex,
    label: defaultSectionLabel(s.orderIndex + 1),
    startOffset: s.startOffset,
    endOffset: s.endOffset,
    // Standalone sections (no duplicate links) — the recorded flow annotates each
    // repeated chorus independently, as it did before Phase 2's link projection.
    canonicalSectionId: null,
    manualUnlink: false,
  }));
  return { ...entry, sections };
}

/**
 * A lyric line, by the line itself: in rhyme-scheme mode every line is a checkbox
 * labelled by its text, so the recording's "click the div whose text is X" is
 * really "tick the box named X".
 *
 * `findAll…[0]` rather than `findBy…` because the song repeats a few lines
 * verbatim ("Oh how you want her"), which makes the name ambiguous — taking the
 * first match keeps the element the recorded `.first()` locator resolved to.
 */
async function line(text: string): Promise<HTMLElement> {
  const boxes = await screen.findAllByRole("checkbox", { name: text });
  return boxes[0];
}

/**
 * Playwright's `page.getByText(str)`: the innermost element whose normalized text
 * contains `str`, strict (an ambiguous match is an error, not a silent first hit).
 *
 * `screen.getByText` can't stand in for it: Testing Library matches an element by
 * its *direct* text nodes, so a composed control like the "X0" group button — a
 * swatch span holding "X" next to a count span holding "0" — has no text of its
 * own and never matches.
 */
function byText(container: HTMLElement, text: string): Promise<HTMLElement> {
  return waitFor(() => {
    const hits = Array.from(container.querySelectorAll<HTMLElement>("*")).filter(
      (el) =>
        norm(el.textContent).includes(text) &&
        !Array.from(el.children).some((c) => norm(c.textContent).includes(text)),
    );
    if (hits.length !== 1) throw new Error(`getByText(${text}) matched ${hits.length} elements`);
    return hits[0];
  });
}

/** Playwright normalizes whitespace before matching text; so do we. */
function norm(text: string | null): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

describe("Rhyme Scheme tests", () => {
  let container: HTMLElement;

  beforeAll(() => {
    seedEntry(makeSectionedEntry());
    container = renderComponent(<Harness entryId={1} />).container;
  });

  it("runs", async () => {
    const user = userEvent.setup();

    await user.click(await line("If the world was ending"));
    await user.click(await line("Steal the bottle Dad's been saving"));
    await user.click(await line("And touch you and get drunk"));
    await user.click(await line("And stop pretending"));
    await user.click(await byText(container, "X0"));
    await user.click(await line("I'd bike over to your house"));
    await user.click(await line("And kiss you on the mouth"));
    await user.click(await line("And watch it all burn down"));
    await user.click(await line("That we might make it out"));
    await user.click(await byText(container, "A0"));
    await user.click(await line("We were two islands"));
    await user.click(await line("And this is a song to tell you to break through"));
    await user.click(await line("Into the muse"));
    await user.click(await line("Into the waiting arms"));
    await user.click(await byText(container, "X0"));
    await user.click(await line("When the waters had parted"));
    await user.click(await line("And finish what you started"));
    await user.click(await line("Oh how you want her"));
    await user.click(await line("At the edge of the water"));
    await user.click(await line("Oh how you want her"));
    await user.click(await line("At the edge of the water"));
    await user.click(await byText(container, "A0"));
    await user.click(await line("Oh how you want her"));
    await user.click(await line("At the edge of the water"));
    await user.click(await byText(container, "B0"));
    await user.click(await line("Now 7th Avenue"));
    await user.click(await line("It wouldn't be so kind to you"));
    await user.click(await line("Your ghost in my room"));
    await user.click(await line("Forever in bloom"));
    await user.click(await byText(container, "A0"));
    await user.click(await line("But in the age of the poets"));
    await user.click(await line("I still drink Four Roses"));
    await user.click(await byText(container, "B0"));
    await user.click(await line("Weren't we the Kings?"));
    await user.click(await line("But the village is a dream"));
    await user.click(await line("Floating out to sea"));
    await user.click(await byText(container, "C0"));
    await user.click(await line("You went to school"));
    await user.click(await line("And settled in your hometown"));
    await user.click(await line("And I missed you, when we'd get drunk"));
    await user.click(await line("Should we stop pretending"));
    await user.click(await byText(container, "X0"));
    await user.click(await line("And got a serious degree"));
    await user.click(await line("To start your family"));
    await user.click(await byText(container, "A0"));
    await user.click(await line("And paint everything black"));
    await user.click(await line("That we might make it back?"));
    await user.click(await byText(container, "B0"));
    // Every section head has a "Select all lines" button, so the name alone is
    // ambiguous — scope it to the one the recording hit (`section:nth-child(7)`,
    // i.e. Section 7). The button sits in the head, outside the section's line group.
    const section7 = screen.getByText("Section 7").closest("section")!;
    await user.click(within(section7).getByRole("button", { name: "Select all lines" }));
    await user.click(await byText(container, "A0"));
    // Both of these are the one-word lyric line "Back". The recording saw it two
    // different ways — bare, and as "BackA" once it carried a group-A badge — but
    // the checkbox is named by the lyric alone, so the badge doesn't come into it.
    await user.click(await line("Back"));
    // The recording caught this group button by the accessible name "9" — back
    // when a segment's swatch was aria-hidden and its bare count was the whole
    // name. The segments now name themselves ("Rhyme group A, 9 lines"), so match
    // the count the recording actually keyed on.
    await user.click(screen.getByRole("button", { name: /, 9 lines$/ }));
    await user.click(await line("Back"));
    await user.click(await byText(container, "X0"));
  });
});
