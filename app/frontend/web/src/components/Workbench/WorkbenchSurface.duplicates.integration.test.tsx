import { useState } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useSuspenseQuery } from "@tanstack/react-query";
import { defaultSectionLabel, type RhymeView } from "@rhymelab/core";
import type { AnnotationDTO, EntryDetail, SectionDTO } from "@rhymelab/api-contract";
import { WorkbenchSurface } from "./WorkbenchSurface";
import { client } from "#/lib/orpc";
import { q } from "#/lib/queries";
import { renderComponent } from "#/test/render-component";
import { makeEntryDetail } from "#/test/mocks/fixtures";
import { seedEntry, store } from "#/test/mocks/handlers";

/**
 * The Phase 2 duplicate wiring end-to-end (client → MSW mock, which applies the
 * SAME shared plan the backend does — D-22). The pure reconcile/election rules are
 * unit-tested in `@rhymelab/core`; here we assert the observable UI: a linked copy
 * renders the canonical's rows, unlink stands it alone, relink re-shares, and a
 * lyrics round-trip re-attaches an annotation.
 */
function Harness({ entryId }: { entryId: number }) {
  const [view, setView] = useState<RhymeView>("colours");
  const { data: entry } = useSuspenseQuery(q.entries.detail(entryId));
  if (!entry) return null;
  return <WorkbenchSurface entry={entry} view={view} onViewChange={setView} />;
}

/** Two identical choruses; section 2 is a duplicate linked to canonical section 1. */
function makeLinkedChorusEntry(overrides: Partial<EntryDetail> = {}): EntryDetail {
  const lyrics = "aa\nbb\n\naa\nbb";
  const sections: SectionDTO[] = [
    {
      id: 1,
      orderIndex: 0,
      label: defaultSectionLabel(1),
      startOffset: 0,
      endOffset: 5,
      canonicalSectionId: null,
      manualUnlink: false,
    },
    {
      id: 2,
      orderIndex: 1,
      label: defaultSectionLabel(2),
      startOffset: 7,
      endOffset: 12,
      canonicalSectionId: 1, // linked to section 1
      manualUnlink: false,
    },
  ];
  return makeEntryDetail({ lyrics, sections, ...overrides });
}

const card = (label: string) => screen.getByText(label).closest("section") as HTMLElement;
const badgesIn = (el: HTMLElement, group: string) =>
  within(el).queryAllByRole("img", { name: `Rhyme group ${group}` });

async function assignGroup(user: ReturnType<typeof userEvent.setup>, group: string): Promise<void> {
  await user.click(
    await screen.findByRole("button", { name: new RegExp(`^Rhyme group ${group},`) }),
  );
}

describe("Workbench duplicate sections (Phase 2)", () => {
  it("annotating one copy propagates to every linked copy (chorus edit)", async () => {
    seedEntry(makeLinkedChorusEntry());
    renderComponent(<Harness entryId={1} />);
    const user = userEvent.setup();
    await screen.findByText("Section 1"); // wait for the suspense query to resolve

    // Annotate the canonical (section 1) "aa" line → A.
    await user.click(within(card("Section 1")).getByRole("checkbox", { name: "aa" }));
    await assignGroup(user, "A");

    // Both the canonical AND the linked copy render the A badge on "aa".
    await waitFor(() => {
      expect(badgesIn(card("Section 1"), "A")).toHaveLength(1);
      expect(badgesIn(card("Section 2"), "A")).toHaveLength(1);
    });
  });

  it("unlink → annotate separately → relink-with-confirm", async () => {
    // Seed with the canonical already carrying A on "aa" (both copies show it).
    const seeded: AnnotationDTO = {
      id: 10,
      sectionId: 1,
      lineInSection: 0,
      startChar: null,
      endChar: null,
      quote: "aa",
      value: "A",
      detached: false,
    };
    seedEntry(makeLinkedChorusEntry({ annotations: [seeded] }));
    renderComponent(<Harness entryId={1} />);
    const user = userEvent.setup();

    await waitFor(() => expect(badgesIn(card("Section 2"), "A")).toHaveLength(1));

    // Unlink section 2 so it can be annotated on its own.
    await user.click(
      within(card("Section 2")).getByRole("button", { name: "Annotate separately" }),
    );
    // Re-annotate section 2's "aa" to B — now the two copies diverge.
    await user.click(within(card("Section 2")).getByRole("checkbox", { name: "aa" }));
    await assignGroup(user, "B");

    await waitFor(() => {
      expect(badgesIn(card("Section 1"), "A")).toHaveLength(1); // canonical unchanged
      expect(badgesIn(card("Section 2"), "B")).toHaveLength(1); // its own mark
    });

    // Relink section 2 (confirm) — its own rows are dropped, the canonical re-shared.
    await user.click(
      within(card("Section 2")).getByRole("button", { name: "Relink to the shared copy" }),
    );
    await user.click(within(card("Section 2")).getByRole("button", { name: "Relink" }));

    await waitFor(() => {
      expect(badgesIn(card("Section 2"), "A")).toHaveLength(1); // shares the canonical again
      expect(badgesIn(card("Section 2"), "B")).toHaveLength(0);
    });
  });
});

describe("saveLyrics round-trip through the shared reconcile plan (Phase 2)", () => {
  beforeEach(() => {
    seedEntry(
      makeEntryDetail({
        id: 5,
        lyrics: "verse one\nverse two\n\nchorus line",
        sections: [
          {
            id: 1,
            orderIndex: 0,
            label: "Section 1",
            startOffset: 0,
            endOffset: 19,
            canonicalSectionId: null,
            manualUnlink: false,
          },
          {
            id: 2,
            orderIndex: 1,
            label: "Section 2",
            startOffset: 21,
            endOffset: 32,
            canonicalSectionId: null,
            manualUnlink: false,
          },
        ],
        annotations: [
          {
            id: 10,
            sectionId: 2,
            lineInSection: 0,
            startChar: null,
            endChar: null,
            quote: "chorus line",
            value: "A",
            detached: false,
          },
        ],
      }),
    );
  });

  it("paste-over detaches an annotation; paste-back re-attaches it (R-1)", async () => {
    // Paste over the chorus with unrelated text — the "chorus line" mark detaches.
    await client.entries.saveLyrics({
      id: 5,
      version: 0,
      lyrics: "verse one\nverse two\n\ntotally different text",
    });
    const afterOver = store.entries.get(5)!;
    const overMark = afterOver.annotations.find((a) => a.value === "A")!;
    expect(overMark.detached).toBe(true);

    // Paste the chorus back — the mark re-attaches on the restored line.
    await client.entries.saveLyrics({
      id: 5,
      version: afterOver.version,
      lyrics: "verse one\nverse two\n\nchorus line",
    });
    const afterBack = store.entries.get(5)!;
    const backMark = afterBack.annotations.find((a) => a.value === "A")!;
    expect(backMark.detached).toBe(false);
    expect(backMark.quote).toBe("chorus line");
    expect(backMark.lineInSection).toBe(0);
  });
});
