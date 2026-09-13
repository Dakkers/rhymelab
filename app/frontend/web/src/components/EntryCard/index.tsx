import type { ReactNode } from "react";
import { Link as RouterLink } from "@tanstack/react-router";
import { Badge, Card, Flex, Icon, InlineList, Text } from "@saintly-software/baritone";
import { AlignLeft, Clock, PenLine, CaseSensitive } from "lucide-react";
import { pluralize } from "../../lib/format";
import type { LyricEntryListItem } from "@rhymelab/api-contract";

const KIND_LABEL: Record<LyricEntryListItem["kind"], string> = {
  song: "Song",
  poem: "Poem",
};

/** Summary card linking to a single saved lyric entry. */
export function EntryCard({ entry }: { entry: LyricEntryListItem }) {
  return (
    <Card
      header={entry.title}
      subheader={<InlineList>{entry.bylineParts}</InlineList>}
      action={<Badge text={KIND_LABEL[entry.kind]} shape="square" saliency="low" />}
      description={entry.excerpt}
      href={`/lyricEntries/${entry.id}`}
      render={<RouterLink to="/entries/$entryId" params={{ entryId: entry.id }} />}
    >
      <InlineList
        separator={
          <Text size="sm" saliency="low">
            ·
          </Text>
        }
      >
        <Stat icon={<AlignLeft />}>{pluralize(entry.lineCount, "line")}</Stat>
        <Stat icon={<CaseSensitive />}>{pluralize(entry.wordCount, "word")}</Stat>
        {entry.kind === "song" && entry.authorsFormatted && (
          <Stat icon={<PenLine />}>Words by {entry.authorsFormatted}</Stat>
        )}
        <Stat icon={<Clock />}>Edited {entry.updatedAtFormatted}</Stat>
      </InlineList>
    </Card>
  );
}

function Stat({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <Text size="sm" saliency="low" render={<Flex inline align="center" gap="1" />}>
      <Icon size="sm">{icon}</Icon>
      {children}
    </Text>
  );
}
