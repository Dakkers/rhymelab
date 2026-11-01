import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Card } from "@saintly-software/baritone";
import { LyricSections } from "#/components/LyricSections";
import { Page } from "#/components/Page";
import { orpc } from "#/lib/orpc";

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

  return (
    <Page title={entry.title}>
      <div style={{ position: "relative" }}>
        <aside className="rl-side-rail" aria-label="Annotation tools">
          <div className="rl-side-rail-inner">
            <Card />
          </div>
        </aside>
        <Card>
          <LyricSections sections={entry.sections} renderLine={(line) => line.text} />
        </Card>
      </div>
    </Page>
  );
}
