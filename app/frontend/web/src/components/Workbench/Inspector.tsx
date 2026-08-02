import { useState } from "react";
import {
  Badge,
  Button,
  Chip,
  Combobox,
  Divider,
  Flex,
  Text,
  TextInput,
  ToggleGroup,
} from "@saintly-software/baritone";
import { Eyebrow } from "#/components/Eyebrow";
import {
  MODE_META,
  RHYME_GROUPS,
  RHYME_GROUP_COLORS,
  optionsForMode,
  sectionTypeLabel,
  type AnnotationMode,
  type RhymeGroup,
  type RhymeView,
  type ViewMode,
} from "@rhymelab/core";
import type { AnnotationDTO, SectionDTO } from "@rhymelab/api-contract";
import {
  commonBodyForLines,
  commonRhymeGroup,
  commonValueForLines,
  existingThemes,
  groupCountsForSection,
  type LineSelection,
} from "./logic";

interface InspectorProps {
  mode: ViewMode;
  lineSelection: LineSelection | null;
  annotations: AnnotationDTO[];
  activeSection: SectionDTO | null;
  view: RhymeView;
  findRhyme: (start: number, end: number) => AnnotationDTO | null;
  /** Finder for the active mode's annotation over a line span. */
  findCurrent: (start: number, end: number) => AnnotationDTO | null;
  onViewChange: (v: RhymeView) => void;
  /** Write (value) / note (body) / clear (both null) the active mode to the
   *  selected lines. The single line-level writer every control commits through. */
  onWriteLines: (value: string | null, body: string | null) => void;
  busy: boolean;
}

/** How many selected lines to spell out before collapsing the rest into "+ N more". */
const LINE_PREVIEW = 6;

export function Inspector(props: InspectorProps) {
  const { mode, activeSection } = props;
  const meta = MODE_META[mode];

  return (
    <aside className="rl-work-aside">
      <Eyebrow>Current section</Eyebrow>
      <Flex align="center" gap="3" mt="2">
        <Text size="lg" weight="semibold" saliency="high">
          {activeSection ? activeSection.label : "—"}
        </Text>

        {activeSection && (
          <Eyebrow as="span" letterSpacing="wider" intent="primary" saliency="mid">
            {sectionTypeLabel(activeSection.type)}
          </Eyebrow>
        )}
      </Flex>

      <Divider my="4" />

      <Flex align="center" gap="2">
        <Badge shape="round" size="sm" color={meta.color} />
        <Text weight="bold" saliency="high">
          {meta.label}
        </Text>
      </Flex>
      <Text as="p" size="sm" saliency="low" mt="2">
        {meta.helper}
      </Text>

      {mode !== "read" && (
        <>
          <Divider my="4" />
          <LinePanel {...props} />
        </>
      )}
    </aside>
  );
}

/**
 * The line-selection panel shared by every annotate mode: the selected line(s)
 * summary at the top, then the mode's own control (rhyme group grid, an option
 * picker, a theme combobox, or a note field), all committing to the selected
 * lines through `onWriteLines`.
 */
function LinePanel(props: InspectorProps) {
  const lines = props.lineSelection?.lines ?? [];
  // Reset any local draft (the note field) when the set of selected lines changes.
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
          <ModeControl key={selectionKey} {...props} />
        </>
      )}
    </>
  );
}

function ModeControl(props: InspectorProps) {
  const { mode } = props;
  if (mode === "rhyme-scheme") return <RhymeControl {...props} />;
  if (mode === "theme") return <ThemeControl {...props} />;
  if (mode === "note") return <NoteControl {...props} />;
  // rhyme-type, sound, device — fixed-vocabulary option pickers.
  return <OptionControl {...props} />;
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
  const assign = (group: RhymeGroup | null) => props.onWriteLines(group, null);

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

/** Fixed-vocabulary picker (rhyme type, sound, device) applied to the lines. */
function OptionControl(props: InspectorProps) {
  const mode = props.mode as AnnotationMode;
  const options = optionsForMode(mode) ?? [];
  const active = commonValueForLines(props.findCurrent, props.lineSelection?.lines ?? []);
  return (
    <div>
      <Eyebrow mb="2">Assign {MODE_META[mode].label.toLowerCase()}</Eyebrow>
      <Flex gap="2" wrap>
        {options.map((o) => (
          <Button
            key={o.value}
            appearance="text"
            intent={active === o.value ? "primary" : "neutral"}
            saliency={active === o.value ? "high" : "low"}
            onClick={() => props.onWriteLines(active === o.value ? null : o.value, null)}
            disabled={props.busy}
          >
            {o.label}
          </Button>
        ))}
      </Flex>
    </div>
  );
}

/** Free-named theme applied to the lines — a single-select over the entry's
 *  existing themes, with `freeText` to coin a new one. */
function ThemeControl(props: InspectorProps) {
  const active = commonValueForLines(props.findCurrent, props.lineSelection?.lines ?? []) ?? null;
  const themes = existingThemes(props.annotations);

  return (
    <Flex direction="column" gap="3">
      <Eyebrow>Assign theme</Eyebrow>
      <Combobox
        freeText
        aria-label="Theme"
        placeholder="Name a theme…"
        options={themes.map((t) => ({ value: t, label: t }))}
        value={active}
        onValueChange={(value) => value !== active && props.onWriteLines(value, null)}
        disabled={props.busy}
      />
      {/*
        The popup lists these too, but keeping them visible is the point: annotating
        runs line-by-line through a handful of recurring themes, and a chip is one
        click where the combobox is open-then-pick.
      */}
      {themes.some((t) => t !== active) && (
        <Flex gap="1" wrap>
          {themes
            .filter((t) => t !== active)
            .map((t) => (
              <Chip
                key={t}
                size="sm"
                onClick={props.busy ? undefined : () => props.onWriteLines(t, null)}
              >
                {t}
              </Chip>
            ))}
        </Flex>
      )}
    </Flex>
  );
}

/** Free-form note applied to the lines. Draft state is local and reset per
 *  selection (see `LinePanel`'s `key`). */
function NoteControl(props: InspectorProps) {
  const current = commonBodyForLines(props.findCurrent, props.lineSelection?.lines ?? []) ?? "";
  const [draft, setDraft] = useState(current);

  return (
    <Flex direction="column" gap="3">
      <TextInput
        multiline
        rows={5}
        label="Note"
        value={draft}
        onChange={(value) => setDraft(value)}
        placeholder="Write a note about these lines…"
      />
      <Flex gap="2">
        <Button
          onClick={() => props.onWriteLines(null, draft.trim() || null)}
          disabled={props.busy || draft.trim() === current.trim()}
        >
          Save note
        </Button>
        {current && (
          <Button
            appearance="text"
            intent="neutral"
            saliency="low"
            onClick={() => {
              setDraft("");
              props.onWriteLines(null, null);
            }}
            disabled={props.busy}
          >
            Remove
          </Button>
        )}
      </Flex>
    </Flex>
  );
}
