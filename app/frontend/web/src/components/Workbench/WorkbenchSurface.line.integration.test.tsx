import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useSuspenseQuery } from "@tanstack/react-query";
import { defaultSectionLabel, detectSections, type RhymeView, type ViewMode } from "@rhymelab/core";
import type { EntryDetail, SectionDTO, SetAnnotationsInput } from "@rhymelab/api-contract";
import { WorkbenchSurface } from "./WorkbenchSurface";
import { q } from "#/lib/queries";
import { renderComponent } from "#/test/render-component";
import { makeLongIslandEntry } from "#/test/mocks/fixtures";
import { observeSetAnnotations, seedEntry } from "#/test/mocks/handlers";

/**
 * The surface, pinned to one Basic mode, without the page chrome. Mirrors the
 * rhyme-scheme harness — every Basic mode is line-level now, so `device`/`theme`/
 * `note` drive the surface the same way rhyme scheme does.
 */
function Harness({ entryId, mode }: { entryId: number; mode: ViewMode }) {
  const [view, setView] = useState<RhymeView>("colours");
  const { data: entry } = useSuspenseQuery(q.entries.detail(entryId));
  if (!entry) return null;
  return <WorkbenchSurface entry={entry} mode={mode} view={view} onViewChange={setView} />;
}

/** The demo entry, split into real sections (the backend does this; the fixture
 *  ships none), so the surface renders one card per section. */
function makeSectionedEntry(overrides: Partial<EntryDetail> = {}): EntryDetail {
  const entry = makeLongIslandEntry(overrides);
  const sections: SectionDTO[] = detectSections(entry.lyrics).map((s) => ({
    id: s.orderIndex + 1,
    orderIndex: s.orderIndex,
    type: "verse",
    label: defaultSectionLabel("verse", s.orderIndex + 1),
    startOffset: s.startOffset,
    endOffset: s.endOffset,
  }));
  return { ...entry, sections };
}

describe("Line-level annotation (non-rhyme mode)", () => {
  it("assigns a device to a selected line", async () => {
    const user = userEvent.setup();
    const writes: SetAnnotationsInput[] = [];
    observeSetAnnotations((input) => writes.push(input));

    seedEntry(makeSectionedEntry());
    renderComponent(<Harness entryId={1} mode="device" />);

    // The whole line is a checkbox named by its lyric — click to select it.
    const [box] = await screen.findAllByRole("checkbox", { name: "If the world was ending" });
    await user.click(box);

    // The device panel appears once a line is selected; tag it "Metaphor".
    await user.click(await screen.findByRole("button", { name: "Metaphor" }));

    // The batch write carries the device value for exactly the one picked line.
    await vi.waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]!.mode).toBe("device");
    expect(writes[0]!.items).toHaveLength(1);
    expect(writes[0]!.items[0]!.value).toBe("metaphor");
    expect(writes[0]!.items[0]!.endOffset).toBeGreaterThan(writes[0]!.items[0]!.startOffset);

    // The write clears the selection, so the picker collapses back to the hint —
    // proof the round-trip landed and re-rendered.
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Metaphor" })).not.toBeInTheDocument(),
    );
  });
});
