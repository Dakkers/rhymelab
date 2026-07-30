import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { Notice } from "@saintly-software/baritone";
import { FileQuestionMark as FileQuestionIcon } from "lucide-react";
import { Workbench } from "#/components/Workbench";
import { q } from "#/lib/queries";
import { WORKBENCH_SEARCH_DEFAULTS, entryIdParams, workbenchSearch } from "#/lib/url";

export const Route = createFileRoute("/_authenticated/entries/$entryId/")({
  // A malformed id never reaches the loader: `params.parse` rejects it during
  // matching and the router falls through to the 404.
  params: entryIdParams,
  validateSearch: workbenchSearch,
  search: { middlewares: [stripSearchParams(WORKBENCH_SEARCH_DEFAULTS)] },
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(q.entries.detail(params.entryId)),
  component: EntryPage,
});

function MissingEntry() {
  return (
    <main className="rl-page">
      <Notice
        icon={<FileQuestionIcon size={18} aria-hidden />}
        description="It may have been deleted, or the link is wrong."
      >
        That entry doesn't exist
      </Notice>
    </main>
  );
}

function EntryPage() {
  const { entryId } = Route.useParams();
  const { mode, view } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: entry } = useSuspenseQuery(q.entries.detail(entryId));

  if (!entry) return <MissingEntry />;

  return (
    <Workbench
      entry={entry}
      mode={mode}
      view={view}
      // `replace` so toggling layers doesn't stack up history entries — the URL
      // is here to be shared and reloaded, not to be walked back through.
      onModeChange={(next) => navigate({ search: (s) => ({ ...s, mode: next }), replace: true })}
      onViewChange={(next) => navigate({ search: (s) => ({ ...s, view: next }), replace: true })}
    />
  );
}
