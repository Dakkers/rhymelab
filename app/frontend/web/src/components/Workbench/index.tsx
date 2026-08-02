import { useState } from "react";
import { Badge, Flex, Heading, Notice, Text, ToggleGroup } from "@saintly-software/baritone";
import { Info as InfoIcon } from "lucide-react";
import { Eyebrow } from "#/components/Eyebrow";
import {
  MODE_META,
  VIEW_MODES,
  entryKindLabel,
  type RhymeView,
  type ViewMode,
} from "@rhymelab/core";
import type { EntryDetail } from "@rhymelab/api-contract";
import { WorkbenchSurface } from "./WorkbenchSurface";
import { deriveSections } from "./logic";

interface WorkbenchProps {
  entry: EntryDetail;
  /** Which annotation layer is active. Lives in the URL (`?mode=`). */
  mode: ViewMode;
  /** How rhyme groups are drawn. Lives in the URL (`?view=`). */
  view: RhymeView;
  onModeChange: (mode: ViewMode) => void;
  onViewChange: (view: RhymeView) => void;
}

/**
 * The entry page's workbench: the title/byline, the auto-detected-structure
 * notice, and the mode bar, wrapped around the editing surface. Everything below
 * the header is `WorkbenchSurface`, which owns the actual annotation state — this
 * component is just the page chrome and the URL-backed mode/view wiring.
 */
export function Workbench({ entry, mode, view, onModeChange, onViewChange }: WorkbenchProps) {
  const [showBanner, setShowBanner] = useState(true);
  const sectionCount = deriveSections(entry).length;

  const eyebrow = [entryKindLabel(entry.kind), entry.tags[0]].filter(Boolean).join(" · ");
  const byline = [entry.artist, entry.year != null ? String(entry.year) : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <WorkbenchSurface
      entry={entry}
      mode={mode}
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
              Structure auto-detected — <strong>{sectionCount} sections</strong>. Change a section's
              type from its header.
            </Notice>
          )}

          <div className="rl-modebar">
            <ToggleGroup label="Mode" labelPosition="start" value={mode} onChange={onModeChange}>
              {({ ToggleGroupItem }) => (
                <>
                  {VIEW_MODES.map((m) => (
                    <ToggleGroupItem key={m} value={m}>
                      <Flex inline align="center" gap="2" render={<span />}>
                        <Badge shape="round" size="sm" color={MODE_META[m].color} />
                        {MODE_META[m].label}
                      </Flex>
                    </ToggleGroupItem>
                  ))}
                </>
              )}
            </ToggleGroup>
          </div>
        </>
      }
    />
  );
}
