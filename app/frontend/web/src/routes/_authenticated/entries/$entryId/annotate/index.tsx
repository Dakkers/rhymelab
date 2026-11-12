import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Card, ToggleGroup } from "@saintly-software/baritone";
import { LyricSections } from "#/components/LyricSections";
import { Page } from "#/components/Page";
import { orpc } from "#/lib/orpc";

type AnnotateMode = "view" | "rhyme" | "enjambment";

export const Route = createFileRoute("/_authenticated/entries/$entryId/annotate/")({
  loader: ({ params, context }) =>
    context.queryClient.ensureQueryData(
      orpc.lyricEntries.getItem.queryOptions({ input: { id: params.entryId } }),
    ),
  component: AnnotatePage,
});

function AnnotatePage() {
  const { entryId } = Route.useParams();
  const { data: entry } = useSuspenseQuery(
    orpc.lyricEntries.getItem.queryOptions({ input: { id: entryId } }),
  );

  const [mode, setMode] = useState<AnnotateMode>("view");

  return (
    <Page title={entry.title}>
      <div style={{ position: "relative" }}>
        <aside className="rl-side-rail" aria-label="Annotation tools">
          <div className="rl-side-rail-inner">
            <Card>
              <ToggleGroup label="Mode" value={mode} onChange={setMode} orientation="vertical">
                {({ ToggleGroupItem }) => (
                  <>
                    <ToggleGroupItem value="view">View-only</ToggleGroupItem>
                    <ToggleGroupItem value="rhyme">Rhyme structure</ToggleGroupItem>
                    <ToggleGroupItem value="enjambment">Enjambment</ToggleGroupItem>
                  </>
                )}
              </ToggleGroup>
            </Card>
          </div>
        </aside>
        <Card>
          <LyricSections sections={entry.sections} renderLine={(line) => line.text} />
        </Card>
      </div>
    </Page>
  );
}
