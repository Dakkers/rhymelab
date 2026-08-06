import { useState } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useSuspenseQuery } from "@tanstack/react-query";
import { defaultSectionLabel, detectSections, type RhymeView } from "@rhymelab/core";
import type { EntryDetail, SectionDTO } from "@rhymelab/api-contract";
import { WorkbenchSurface } from "./WorkbenchSurface";
import { q } from "#/lib/queries";
import { renderComponent } from "#/test/render-component";
import { makeEntryDetail } from "#/test/mocks/fixtures";
import { seedEntry, store } from "#/test/mocks/handlers";

/**
 * Exercises the Phase 1 write wiring end-to-end (client → real MSW mock, which
 * applies the SAME shared core plan the backend does), on a tiny controlled
 * entry so line text and badges are unambiguous. The pure replace/X/idempotence
 * rules are unit-tested in `@rhymelab/core`; here we assert the observable UI.
 */
function Harness({ entryId }: { entryId: number }) {
  const [view, setView] = useState<RhymeView>("colours");
  const { data: entry } = useSuspenseQuery(q.entries.detail(entryId));
  if (!entry) return null;
  return <WorkbenchSurface entry={entry} view={view} onViewChange={setView} />;
}

/** A two-section entry ("alpha/bravo" · "charlie/delta") with real sections. */
function makeControlledEntry(overrides: Partial<EntryDetail> = {}): EntryDetail {
  const entry = makeEntryDetail({
    lyrics: "alpha\nbravo\n\ncharlie\ndelta",
    ...overrides,
  });
  const sections: SectionDTO[] = detectSections(entry.lyrics).map((s) => ({
    id: s.orderIndex + 1,
    orderIndex: s.orderIndex,
    label: defaultSectionLabel(s.orderIndex + 1),
    startOffset: s.startOffset,
    endOffset: s.endOffset,
    canonicalSectionId: null,
    manualUnlink: false,
  }));
  return { ...entry, sections };
}

/** Tick a line by its lyric (each line is a checkbox named by its text). */
async function pickLine(user: ReturnType<typeof userEvent.setup>, text: string): Promise<void> {
  await user.click(await screen.findByRole("checkbox", { name: text }));
}

/** Click the group button in the (visible) inspector grid — matches any count. */
async function assignGroup(user: ReturnType<typeof userEvent.setup>, group: string): Promise<void> {
  await user.click(
    await screen.findByRole("button", { name: new RegExp(`^Rhyme group ${group},`) }),
  );
}

/** The rhyme badge (`role="img"`) currently painted on any line, by group. */
function badge(group: string): HTMLElement | null {
  return screen.queryByRole("img", { name: `Rhyme group ${group}` });
}

describe("Workbench annotation semantics (Phase 1)", () => {
  beforeEach(() => {
    seedEntry(makeControlledEntry());
    renderComponent(<Harness entryId={1} />);
  });

  it("replaces a line's group — no stacking (D-4)", async () => {
    const user = userEvent.setup();
    await pickLine(user, "alpha");
    await assignGroup(user, "A");
    expect(await screen.findByRole("img", { name: "Rhyme group A" })).toBeInTheDocument();

    // Re-select and stamp B: the line flips to B, A is gone (not A + B).
    await pickLine(user, "alpha");
    await assignGroup(user, "B");
    expect(await screen.findByRole("img", { name: "Rhyme group B" })).toBeInTheDocument();
    expect(badge("A")).toBeNull();
  });

  it("X on an A-line leaves exactly one X (X-exclusivity, D-5)", async () => {
    const user = userEvent.setup();
    await pickLine(user, "bravo");
    await assignGroup(user, "A");
    expect(await screen.findByRole("img", { name: "Rhyme group A" })).toBeInTheDocument();

    await pickLine(user, "bravo");
    await assignGroup(user, "X");
    expect(await screen.findByRole("img", { name: "Rhyme group X" })).toBeInTheDocument();
    expect(badge("A")).toBeNull();
  });

  it("re-pressing the active group clears the line (clearLines)", async () => {
    const user = userEvent.setup();
    await pickLine(user, "charlie");
    await assignGroup(user, "C");
    expect(await screen.findByRole("img", { name: "Rhyme group C" })).toBeInTheDocument();

    // Re-select and re-press C (the active group) → clears it off the line.
    await pickLine(user, "charlie");
    await assignGroup(user, "C");
    await screen.findByRole("checkbox", { name: "charlie" }); // settled
    expect(badge("C")).toBeNull();
  });

  it("a stale-version write 409s and the UI recovers", async () => {
    const user = userEvent.setup();
    // Wait for the client to load the entry at version 0 FIRST, then simulate a
    // concurrent lyrics save that bumped the stored version — the client's cached
    // copy still says 0, so its next write is stale.
    await screen.findByRole("checkbox", { name: "delta" });
    store.entries.get(1)!.version = 7;

    await pickLine(user, "delta");
    await assignGroup(user, "A");

    // The client surfaces the reload notice and drops the stale selection...
    expect(await screen.findByText("Lyrics changed — reloaded")).toBeInTheDocument();
    // ...and nothing was written (no badge appeared).
    expect(badge("A")).toBeNull();
  });
});
