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
import { X as XIcon } from "lucide-react";
import { Eyebrow } from "#/components/Eyebrow";
import {
  MODE_META,
  RHYME_GROUPS,
  RHYME_GROUP_COLORS,
  labelForValue,
  optionsForMode,
  sectionTypeLabel,
  type AnnotationMode,
  type RhymeGroup,
  type RhymeView,
  type ViewMode,
} from "@rhymelab/core";
import type { AnnotationDTO, SectionDTO } from "@rhymelab/api-contract";
import {
  annotationsCoveringSpan,
  colorForAnnotation,
  commonRhymeGroup,
  existingThemes,
  groupCountsForSection,
  type LineSelection,
  type Selection,
} from "./logic";

interface InspectorProps {
  mode: ViewMode;
  selection: Selection | null;
  lineSelection: LineSelection | null;
  annotations: AnnotationDTO[];
  activeSection: SectionDTO | null;
  view: RhymeView;
  findRhyme: (start: number, end: number) => AnnotationDTO | null;
  onViewChange: (v: RhymeView) => void;
  onWrite: (value: string | null, body: string | null) => void;
  onClearMode: (mode: AnnotationMode) => void;
  onWriteGroup: (group: RhymeGroup | null) => void;
  busy: boolean;
}

const MODE_LABELS: Record<AnnotationMode, string> = {
  "rhyme-scheme": "Rhyme scheme",
  "rhyme-type": "Rhyme type",
  sound: "Sound",
  theme: "Theme",
  device: "Device",
  note: "Note",
};

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

      <Divider my="4" />

      {mode === "rhyme-scheme" ? <RhymeSchemePanel {...props} /> : <WordPanel {...props} />}
    </aside>
  );
}

/** Word/phrase selection panel — every mode except rhyme scheme. */
function WordPanel(props: InspectorProps) {
  const { mode, selection, annotations } = props;
  const covering = selection
    ? annotationsCoveringSpan(annotations, selection.start, selection.end)
    : {};

  return (
    <>
      <Eyebrow>Selected {selection?.wordIndex != null ? "word" : "text"}</Eyebrow>
      {selection ? (
        <Text
          font="serif"
          size="3xl"
          weight="semibold"
          saliency="high"
          overflowWrap="break-word"
          mt="2"
        >
          “{selection.text}”
        </Text>
      ) : (
        <Text size="sm" italic saliency="low" mt="2">
          Select a word in the lyrics to annotate it.
        </Text>
      )}

      {/* Cross-mode summary of what's on the selected span. */}
      {selection && Object.keys(covering).length > 0 && (
        <Flex direction="column" gap="2" mt="4">
          {(Object.keys(covering) as AnnotationMode[]).map((m) => {
            const ann = covering[m]!;
            const color = colorForAnnotation(ann);
            const value =
              m === "note" ? (ann.body ?? "Note") : ann.value ? labelForValue(m, ann.value) : "—";
            return (
              <div key={m} className="rl-assign-card">
                <div className="body">
                  {color && m !== "note" && <Badge shape="square" size="lg" color={color.solid} />}
                  <div className="text">
                    <Eyebrow>{MODE_LABELS[m]}</Eyebrow>
                    <Text size="sm" weight="semibold" saliency="high">
                      {value}
                    </Text>
                  </div>
                </div>
                <Button
                  intent="neutral"
                  saliency="low"
                  size="sm"
                  icon={<XIcon size={14} aria-hidden />}
                  aria-label={`Clear ${MODE_LABELS[m]}`}
                  onClick={() => props.onClearMode(m)}
                  disabled={props.busy}
                />
              </div>
            );
          })}
        </Flex>
      )}

      {/* Current-mode control. Keyed on the span so local drafts reset per word. */}
      {mode !== "read" && selection && (
        <>
          <Divider my="4" />
          <ModeControl
            key={`${mode}:${selection.start}:${selection.end}`}
            {...props}
            covering={covering}
          />
        </>
      )}
    </>
  );
}

function ModeControl(
  props: InspectorProps & { covering: Partial<Record<AnnotationMode, AnnotationDTO>> },
) {
  const { mode } = props;
  if (mode === "theme") return <ThemeControl {...props} />;
  if (mode === "note") return <NoteControl {...props} />;
  return <OptionControl {...props} />;
}

/** Rhyme-scheme panel — a line selection plus the group grid that writes it. */
function RhymeSchemePanel(props: InspectorProps) {
  const lines = props.lineSelection?.lines ?? [];
  const active = commonRhymeGroup(props.findRhyme, lines);

  return (
    <>
      <Eyebrow>{lines.length > 1 ? "Selected lines" : "Selected line"}</Eyebrow>
      {lines.length === 0 ? (
        <Text size="sm" italic saliency="low" mt="2">
          Check the lines that rhyme, then assign a group. ⇧-click for a range.
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
          <RhymeControl {...props} active={active} />
        </>
      )}
    </>
  );
}

function RhymeControl(props: InspectorProps & { active: RhymeGroup | undefined }) {
  const { activeSection, annotations, view, active } = props;
  const counts = activeSection
    ? groupCountsForSection(annotations, activeSection)
    : ({ A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, X: 0 } as Record<RhymeGroup, number>);

  return (
    <Flex direction="column" gap="4">
      <div>
        <Eyebrow mb="2">Assign rhyme group</Eyebrow>
        <div className="rl-group-grid">
          {RHYME_GROUPS.map((g) => {
            const c = RHYME_GROUP_COLORS[g];
            return (
              <button
                key={g}
                type="button"
                className="rl-group-btn"
                data-active={active === g ? "true" : undefined}
                onClick={() => props.onWriteGroup(active === g ? null : g)}
                disabled={props.busy}
              >
                <span
                  className="rl-group-swatch"
                  style={{ background: c.solid, color: c.ink }}
                  aria-hidden
                >
                  <Text as="span" size="xs" weight="superbold" style={{ color: "inherit" }}>
                    {g}
                  </Text>
                </span>
                <Text as="span" size="xs" weight="semibold" saliency="low" ml="auto">
                  {counts[g]}
                </Text>
              </button>
            );
          })}
        </div>
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

function OptionControl(
  props: InspectorProps & { covering: Partial<Record<AnnotationMode, AnnotationDTO>> },
) {
  const options = optionsForMode(props.mode as AnnotationMode) ?? [];
  const active = props.covering[props.mode as AnnotationMode]?.value;
  return (
    <div>
      <Eyebrow mb="2">Assign {MODE_META[props.mode].label.toLowerCase()}</Eyebrow>
      <Flex gap="2" wrap>
        {options.map((o) => (
          <Button
            key={o.value}
            appearance="text"
            intent={active === o.value ? "primary" : "neutral"}
            saliency={active === o.value ? "high" : "low"}
            onClick={() => props.onWrite(active === o.value ? null : o.value, null)}
            disabled={props.busy}
          >
            {o.label}
          </Button>
        ))}
      </Flex>
    </div>
  );
}

function ThemeControl(
  props: InspectorProps & { covering: Partial<Record<AnnotationMode, AnnotationDTO>> },
) {
  const active = props.covering.theme?.value ?? null;
  const themes = existingThemes(props.annotations);

  return (
    <Flex direction="column" gap="3">
      <Eyebrow>Assign theme</Eyebrow>
      {/*
        Unlike the other modes, a theme isn't drawn from a fixed vocabulary — it's
        whatever this entry has accumulated — so this is a single-select over
        `existingThemes` with `freeText` to coin a new one. There's no local draft
        state: the value is the annotation covering the span, and committing writes
        straight through. `onWrite(null, …)` is the identical call `clearMode` makes,
        which is what lets the built-in ✕ mean "clear the theme".
      */}
      <Combobox
        freeText
        aria-label="Theme"
        placeholder="Name a theme…"
        options={themes.map((t) => ({ value: t, label: t }))}
        value={active}
        onValueChange={(value) => value !== active && props.onWrite(value, null)}
        disabled={props.busy}
      />
      {/*
        The popup lists these too, but keeping them visible is the point: annotating
        runs word-by-word through a handful of recurring themes, and a chip is one
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
                onClick={props.busy ? undefined : () => props.onWrite(t, null)}
              >
                {t}
              </Chip>
            ))}
        </Flex>
      )}
    </Flex>
  );
}

function NoteControl(
  props: InspectorProps & { covering: Partial<Record<AnnotationMode, AnnotationDTO>> },
) {
  const current = props.covering.note?.body ?? "";
  const [draft, setDraft] = useState(current);

  return (
    <Flex direction="column" gap="3">
      <TextInput
        multiline
        rows={5}
        label="Note"
        value={draft}
        onChange={(value) => setDraft(value)}
        placeholder="Write a note about this word or phrase…"
      />
      <Flex gap="2">
        <Button
          onClick={() => props.onWrite(null, draft.trim() || null)}
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
              props.onClearMode("note");
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
