import { Badge, Divider, Flex, Text, ToggleGroup } from "@saintly-software/baritone";
import { Eyebrow } from "#/components/Eyebrow";
import {
  RHYME_ACCENT,
  RHYME_GROUPS,
  RHYME_GROUP_COLORS,
  RHYME_HELPER,
  type RhymeGroup,
  type RhymeView,
} from "@rhymelab/core";
import type { AnnotationDTO, SectionDTO } from "@rhymelab/api-contract";
import { commonRhymeGroup, groupCountsForSection, type LineSelection } from "./logic";

interface InspectorProps {
  lineSelection: LineSelection | null;
  annotations: AnnotationDTO[];
  activeSection: SectionDTO | null;
  view: RhymeView;
  findRhyme: (start: number, end: number) => AnnotationDTO | null;
  onViewChange: (v: RhymeView) => void;
  /** Write the rhyme group (value) / clear it (null) on the selected lines. */
  onWriteLines: (value: string | null) => void;
  busy: boolean;
}

/** How many selected lines to spell out before collapsing the rest into "+ N more". */
const LINE_PREVIEW = 6;

export function Inspector(props: InspectorProps) {
  const { activeSection } = props;

  return (
    <aside className="rl-work-aside">
      <Eyebrow>Current section</Eyebrow>
      <Flex align="center" gap="3" mt="2">
        <Text size="lg" weight="semibold" saliency="high">
          {activeSection ? activeSection.label : "—"}
        </Text>
      </Flex>

      <Divider my="4" />

      <Flex align="center" gap="2">
        <Badge shape="round" size="sm" color={RHYME_ACCENT} />
        <Text weight="bold" saliency="high">
          Rhyme scheme
        </Text>
      </Flex>
      <Text as="p" size="sm" saliency="low" mt="2">
        {RHYME_HELPER}
      </Text>

      <Divider my="4" />
      <LinePanel {...props} />
    </aside>
  );
}

/**
 * The line-selection panel: the selected line(s) summary at the top, then the
 * rhyme-group control, committing to the selected lines through `onWriteLines`.
 */
function LinePanel(props: InspectorProps) {
  const lines = props.lineSelection?.lines ?? [];
  // Re-key the rhyme control when the set of selected lines changes, so it
  // re-reads which group (if any) those lines share.
  const selectionKey = `${props.lineSelection?.sectionId ?? ""}:${lines.map((l) => l.index).join(",")}`;

  return (
    <>
      <Eyebrow>{lines.length > 1 ? "Selected lines" : "Selected line"}</Eyebrow>
      {lines.length === 0 ? (
        <Text size="sm" italic saliency="low" mt="2">
          Select the lines you want to annotate — ⇧-click for a range.
        </Text>
      ) : lines.length === 1 ? (
        <Text
          font="serif"
          size="3xl"
          weight="semibold"
          saliency="high"
          overflowWrap="break-word"
          mt="2"
        >
          “{lines[0]!.text.trim()}”
        </Text>
      ) : (
        <>
          <Text size="lg" weight="semibold" saliency="high" mt="2">
            {lines.length} lines
          </Text>
          <Flex direction="column" gap="1" mt="2">
            {lines.slice(0, LINE_PREVIEW).map((l) => (
              <Text key={l.index} font="serif" size="sm" saliency="low" overflowWrap="break-word">
                “{l.text.trim()}”
              </Text>
            ))}
            {lines.length > LINE_PREVIEW && (
              <Text size="sm" saliency="low">
                + {lines.length - LINE_PREVIEW} more
              </Text>
            )}
          </Flex>
        </>
      )}

      {lines.length > 0 && (
        <>
          <Divider my="4" />
          <RhymeControl key={selectionKey} {...props} />
        </>
      )}
    </>
  );
}

/** Rhyme-scheme control: the A–F/X group grid, the colours/letters view toggle,
 *  and the legend. The group is written to every selected line. */
function RhymeControl(props: InspectorProps) {
  const { activeSection, annotations, view } = props;
  const lines = props.lineSelection?.lines ?? [];
  const active = commonRhymeGroup(props.findRhyme, lines);
  const counts = activeSection
    ? groupCountsForSection(annotations, activeSection)
    : ({ A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, X: 0 } as Record<RhymeGroup, number>);

  // A clearable group: re-pressing the active group takes it back off (onChange
  // fires with null), which the line writer treats as "clear these lines".
  const assign = (group: RhymeGroup | null) => props.onWriteLines(group);

  return (
    <Flex direction="column" gap="4">
      {/*
        `clearable` is what lets this be a ToggleGroup at all: a line may carry no
        group (`active` is undefined until one is assigned), and re-pressing the
        active group is how you take it back off — both of which the strict arm
        forbids. Each segment's colour is per-group *data*, not a token, so it
        rides in as an inline-styled swatch child while the group's own
        intent/saliency style the selected state.

        Each segment draws that swatch with its count trailing it, so the
        flattened text would announce as "A 3" — hence the authored `aria-label`,
        which still contains the visible letter and count per WCAG 2.5.3.
      */}
      <div className="rl-group-field">
        <ToggleGroup
          clearable
          label="Assign rhyme group"
          className="rl-group-grid"
          value={active ?? null}
          onChange={assign}
          intent="primary"
          saliency="mid"
          size="sm"
          disabled={props.busy}
        >
          {({ ToggleGroupItem }) =>
            RHYME_GROUPS.map((g) => {
              const c = RHYME_GROUP_COLORS[g];
              return (
                <ToggleGroupItem
                  key={g}
                  value={g}
                  aria-label={`Rhyme group ${g}, ${counts[g]} lines`}
                >
                  <span className="rl-group-swatch" style={{ background: c.solid, color: c.ink }}>
                    <Text as="span" size="xs" weight="superbold" style={{ color: "inherit" }}>
                      {g}
                    </Text>
                  </span>
                  <Text as="span" size="xs" weight="semibold" saliency="low">
                    {counts[g]}
                  </Text>
                </ToggleGroupItem>
              );
            })
          }
        </ToggleGroup>
      </div>

      <ToggleGroup label="View" value={view} onChange={props.onViewChange}>
        {({ ToggleGroupItem }) => (
          <>
            <ToggleGroupItem value="colours">Colours</ToggleGroupItem>
            <ToggleGroupItem value="letters">Scheme letters</ToggleGroupItem>
          </>
        )}
      </ToggleGroup>

      <div>
        <Eyebrow mb="2">Legend</Eyebrow>
        <Flex direction="column" gap="2">
          <Flex align="center" gap="3">
            <span className="rl-legend-swatch" style={{ background: RHYME_GROUP_COLORS.A.tint }} />
            <Text size="sm" saliency="low">
              Rhyming lines share a colour
            </Text>
          </Flex>
          <Flex align="center" gap="3">
            <span
              className="rl-legend-swatch"
              style={{ background: RHYME_GROUP_COLORS.X.solid, color: RHYME_GROUP_COLORS.X.ink }}
            >
              <Text as="span" size="xs" weight="superbold" style={{ color: "inherit" }}>
                X
              </Text>
            </span>
            <Text size="sm" saliency="low">
              A line that doesn't rhyme
            </Text>
          </Flex>
        </Flex>
      </div>
    </Flex>
  );
}
