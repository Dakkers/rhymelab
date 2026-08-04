import { useState } from "react";
import { Heading, Notice, Text } from "@saintly-software/baritone";
import { Info as InfoIcon } from "lucide-react";
import { Eyebrow } from "#/components/Eyebrow";
import { entryKindLabel, type RhymeView } from "@rhymelab/core";
import type { EntryDetail } from "@rhymelab/api-contract";
import { WorkbenchSurface } from "./WorkbenchSurface";
import { deriveSections } from "./logic";

interface WorkbenchProps {
  entry: EntryDetail;
  /** How rhyme groups are drawn. Lives in the URL (`?view=`). */
  view: RhymeView;
  onViewChange: (view: RhymeView) => void;
}

/**
 * The entry page's workbench: the title/byline and the auto-detected-structure
 * notice, wrapped around the editing surface. Everything below the header is
 * `WorkbenchSurface`, which owns the actual annotation state — this component is
 * just the page chrome and the URL-backed view wiring.
 */
export function Workbench({ entry, view, onViewChange }: WorkbenchProps) {
  const [showBanner, setShowBanner] = useState(true);
  const sectionCount = deriveSections(entry).length;

  const eyebrow = [entryKindLabel(entry.kind), entry.tags[0]].filter(Boolean).join(" · ");
  const byline = [entry.artist, entry.year != null ? String(entry.year) : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <WorkbenchSurface
      entry={entry}
      view={view}
      onViewChange={onViewChange}
      header={
        <>
          <Eyebrow>{eyebrow}</Eyebrow>
          <Heading level={1} size="8xl" font="serif" mt="2" lineHeight="title">
            {entry.title}
          </Heading>

          {byline && (
            <Text size="lg" font="serif" italic saliency="low" mt="2">
              {byline}
            </Text>
          )}

          {showBanner && sectionCount > 0 && (
            <Notice
              intent="positive"
              icon={<InfoIcon size={18} aria-hidden />}
              close={() => setShowBanner(false)}
              mt="6"
            >
              Structure auto-detected — <strong>{sectionCount} sections</strong>. Click the lines
              that rhyme, then assign a group.
            </Notice>
          )}
        </>
      }
    />
  );
}
