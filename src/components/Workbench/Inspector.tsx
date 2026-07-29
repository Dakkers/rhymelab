import { useState } from "react";
import { Button, Chip, Flex, TextInput, ToggleGroup } from "@saintly-software/baritone";
import { X as XIcon } from "lucide-react";
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
} from "#/lib/constants";
import type { AnnotationDTO, SectionDTO } from "#/server/entries";
import {
  annotationsCoveringSpan,
  colorForAnnotation,
  existingThemes,
  groupCountsForSection,
  type Selection,
} from "./logic";

interface InspectorProps {
  mode: ViewMode;
  selection: Selection | null;
  annotations: AnnotationDTO[];
  activeSection: SectionDTO | null;
  view: RhymeView;
  onViewChange: (v: RhymeView) => void;
  onWrite: (value: string | null, body: string | null) => void;
  onClearMode: (mode: AnnotationMode) => void;
  busy: boolean;
}

const MODE_LABELS: Record<AnnotationMode, string> = {
  "rhyme-structure": "Rhyme structure",
  "rhyme-type": "Rhyme type",
  sound: "Sound",
  theme: "Theme",
  device: "Device",
  note: "Note",
};

export function Inspector(props: InspectorProps) {
  const { mode, selection, annotations, activeSection } = props;
  const meta = MODE_META[mode];
  const covering = selection
    ? annotationsCoveringSpan(annotations, selection.start, selection.end)
    : {};

  return (
    <aside className="rl-work-aside">
      <div className="rl-panel-label">Current section</div>
      <div className="rl-panel-section-title" style={{ marginTop: 6 }}>
        {activeSection ? activeSection.label : "—"}
        {activeSection && (
          <span
            style={{
              fontSize: "0.72rem",
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--rl-brand)",
            }}
          >
            {sectionTypeLabel(activeSection.type)}
          </span>
        )}
      </div>

      <div className="rl-panel-divider" />

      <div className="rl-mode-heading">
        <span className="dot" style={{ background: meta.color }} />
        {meta.label}
      </div>
      <p className="rl-helper" style={{ marginTop: 8 }}>
        {meta.helper}
      </p>

      <div className="rl-panel-divider" />

      <div className="rl-panel-label">
        Selected {selection?.wordIndex != null ? "word" : "text"}
      </div>
      {selection ? (
        <div className="rl-selected-word" style={{ marginTop: 6 }}>
          “{selection.text}”
        </div>
      ) : (
        <div className="rl-selected-empty" style={{ marginTop: 6 }}>
          Select a word in the lyrics to annotate it.
        </div>
      )}

      {/* Cross-mode summary of what's on the selected span. */}
      {selection && Object.keys(covering).length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
          {(Object.keys(covering) as AnnotationMode[]).map((m) => {
            const ann = covering[m]!;
            const color = colorForAnnotation(ann);
            const value =
              m === "note" ? (ann.body ?? "Note") : ann.value ? labelForValue(m, ann.value) : "—";
            return (
              <div key={m} className="rl-assign-card">
                <div className="body">
                  {color && m !== "note" && (
                    <span className="swatch" style={{ background: color.solid }} />
                  )}
                  <div className="text">
                    <span className="label">{MODE_LABELS[m]}</span>
                    <span className="value">{value}</span>
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
        </div>
      )}

      {/* Current-mode control. Keyed on the span so local drafts reset per word. */}
      {mode !== "read" && selection && (
        <>
          <div className="rl-panel-divider" />
          <ModeControl
            key={`${mode}:${selection.start}:${selection.end}`}
            {...props}
            covering={covering}
          />
        </>
      )}
    </aside>
  );
}

function ModeControl(
  props: InspectorProps & { covering: Partial<Record<AnnotationMode, AnnotationDTO>> },
) {
  const { mode } = props;
  if (mode === "rhyme-structure") return <RhymeControl {...props} />;
  if (mode === "theme") return <ThemeControl {...props} />;
  if (mode === "note") return <NoteControl {...props} />;
  return <OptionControl {...props} />;
}

function RhymeControl(
  props: InspectorProps & { covering: Partial<Record<AnnotationMode, AnnotationDTO>> },
) {
  const { activeSection, annotations, covering, view } = props;
  const counts = activeSection
    ? groupCountsForSection(annotations, activeSection)
    : ({ A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, X: 0 } as Record<RhymeGroup, number>);
  const active = covering["rhyme-structure"]?.value as RhymeGroup | undefined;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <div className="rl-panel-label" style={{ marginBottom: 8 }}>
          Assign rhyme group
        </div>
        <div className="rl-group-grid">
          {RHYME_GROUPS.map((g) => {
            const c = RHYME_GROUP_COLORS[g];
            return (
              <button
                key={g}
                type="button"
                className="rl-group-btn"
                data-active={active === g ? "true" : undefined}
                onClick={() => props.onWrite(active === g ? null : g, null)}
                disabled={props.busy}
              >
                <span
                  className="rl-group-swatch"
                  style={{ background: c.solid, color: c.ink }}
                  aria-hidden
                >
                  {g}
                </span>
                <span className="rl-group-count">{counts[g]}</span>
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
        <div className="rl-panel-label" style={{ marginBottom: 8 }}>
          Legend
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="rl-legend-row">
            <span className="rl-legend-swatch" style={{ background: RHYME_GROUP_COLORS.A.tint }} />
            Rhyming words share a colour
          </div>
          <div className="rl-legend-row">
            <span
              className="rl-legend-swatch"
              style={{ background: RHYME_GROUP_COLORS.X.solid, color: RHYME_GROUP_COLORS.X.ink }}
            >
              X
            </span>
            A line or word that doesn't rhyme
          </div>
        </div>
      </div>
    </div>
  );
}

function OptionControl(
  props: InspectorProps & { covering: Partial<Record<AnnotationMode, AnnotationDTO>> },
) {
  const options = optionsForMode(props.mode as AnnotationMode) ?? [];
  const active = props.covering[props.mode as AnnotationMode]?.value;
  return (
    <div>
      <div className="rl-panel-label" style={{ marginBottom: 8 }}>
        Assign {MODE_META[props.mode].label.toLowerCase()}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
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
      </div>
    </div>
  );
}

function ThemeControl(
  props: InspectorProps & { covering: Partial<Record<AnnotationMode, AnnotationDTO>> },
) {
  const active = props.covering.theme?.value ?? "";
  const [draft, setDraft] = useState(active);
  const themes = existingThemes(props.annotations).filter((t) => t !== active);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="rl-panel-label">Assign theme</div>
      <div className="rl-taginput" style={{ padding: "4px 6px" }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && draft.trim()) {
              e.preventDefault();
              props.onWrite(draft.trim(), null);
            }
          }}
          placeholder="Name a theme…"
        />
        <Button
          appearance="text"
          onClick={() => draft.trim() && props.onWrite(draft.trim(), null)}
          disabled={props.busy || !draft.trim()}
        >
          Add
        </Button>
      </div>
      {themes.length > 0 && (
        <Flex gap="1" wrap>
          {themes.map((t) => (
            <Chip key={t} size="sm" onClick={props.busy ? undefined : () => props.onWrite(t, null)}>
              {t}
            </Chip>
          ))}
        </Flex>
      )}
    </div>
  );
}

function NoteControl(
  props: InspectorProps & { covering: Partial<Record<AnnotationMode, AnnotationDTO>> },
) {
  const current = props.covering.note?.body ?? "";
  const [draft, setDraft] = useState(current);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <TextInput
        multiline
        rows={5}
        label="Note"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Write a note about this word or phrase…"
      />
      <div style={{ display: "flex", gap: 8 }}>
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
      </div>
    </div>
  );
}
