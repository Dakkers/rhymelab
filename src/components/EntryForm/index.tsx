import { useState, type InputHTMLAttributes, type KeyboardEvent } from "react";
import { Chip, Field, Flex, Select, TextInput } from "@saintly-software/baritone";
import { ENTRY_KINDS, type EntryKind } from "#/lib/constants";
import type { EntryDetail } from "#/server/entries";

/** The controlled shape of the metadata form — `year` stays a string here. */
export interface EntryFormState {
  title: string;
  kind: EntryKind;
  artist: string;
  collection: string;
  year: string;
  tags: string[];
  notes: string;
}

export function emptyEntryForm(): EntryFormState {
  return { title: "", kind: "song", artist: "", collection: "", year: "", tags: [], notes: "" };
}

export function entryToForm(e: EntryDetail): EntryFormState {
  return {
    title: e.title,
    kind: e.kind,
    artist: e.artist ?? "",
    collection: e.collection ?? "",
    year: e.year != null ? String(e.year) : "",
    tags: e.tags,
    notes: e.notes ?? "",
  };
}

/** The metadata subset shared by create + update, ready for a server fn. */
export function toEntryPayload(s: EntryFormState) {
  const yearNum = s.year.trim() ? Number(s.year.trim()) : null;
  return {
    title: s.title.trim(),
    kind: s.kind,
    artist: s.artist.trim() || null,
    collection: s.collection.trim() || null,
    year: Number.isFinite(yearNum) ? yearNum : null,
    notes: s.notes.trim() || null,
    tags: s.tags,
  };
}

const KIND_OPTIONS = ENTRY_KINDS.map((value) => ({
  value,
  label: value === "song" ? "Song" : "Poem",
}));

interface EntryFieldsProps {
  value: EntryFormState;
  onChange: (patch: Partial<EntryFormState>) => void;
  disabled?: boolean;
  showTitleError?: boolean;
}

/** The metadata fields, controlled by the parent route. */
export function EntryFields({ value, onChange, disabled, showTitleError }: EntryFieldsProps) {
  const collectionLabel = value.kind === "poem" ? "Collection" : "Album";
  const artistLabel = value.kind === "poem" ? "Author" : "Artist";

  return (
    <Flex direction="column" gap="4">
      <TextInput
        label="Title"
        value={value.title}
        onChange={(e) => onChange({ title: e.target.value })}
        disabled={disabled}
        state={showTitleError && !value.title.trim() ? "invalid" : "neutral"}
        helpText={showTitleError && !value.title.trim() ? "A title is required." : undefined}
        autoFocus
      />

      <div className="rl-form-grid">
        <Select
          label="Type"
          options={KIND_OPTIONS}
          value={value.kind}
          onChange={(v) => v && onChange({ kind: v as EntryKind })}
          disabled={disabled}
        />
        <TextInput
          label="Year"
          type="number"
          inputMode="numeric"
          value={value.year}
          onChange={(e) => onChange({ year: e.target.value })}
          disabled={disabled}
          placeholder="e.g. 1845"
        />
      </div>

      <div className="rl-form-grid">
        <TextInput
          label={artistLabel}
          value={value.artist}
          onChange={(e) => onChange({ artist: e.target.value })}
          disabled={disabled}
        />
        <TextInput
          label={collectionLabel}
          value={value.collection}
          onChange={(e) => onChange({ collection: e.target.value })}
          disabled={disabled}
        />
      </div>

      <Field label="Tags">
        {({ nameAttrs, describedBy }) => (
          <TagInput
            value={value.tags}
            onChange={(tags) => onChange({ tags })}
            disabled={disabled}
            inputProps={{ ...nameAttrs, "aria-describedby": describedBy }}
          />
        )}
      </Field>

      <TextInput
        multiline
        rows={4}
        label="Notes"
        value={value.notes}
        onChange={(e) => onChange({ notes: e.target.value })}
        disabled={disabled}
        placeholder="Anything worth remembering about this piece…"
      />
    </Flex>
  );
}

/** A minimal chip-input: type + Enter/comma to add, Backspace to remove last. */
export function TagInput({
  value,
  onChange,
  disabled,
  inputProps,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  disabled?: boolean;
  inputProps?: InputHTMLAttributes<HTMLInputElement>;
}) {
  const [draft, setDraft] = useState("");

  function commit(raw: string) {
    const parts = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!parts.length) return;
    const next = [...value];
    for (const p of parts) {
      if (!next.some((t) => t.toLowerCase() === p.toLowerCase())) next.push(p);
    }
    onChange(next);
    setDraft("");
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit(draft);
    } else if (e.key === "Backspace" && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  }

  return (
    <div className="rl-taginput">
      {value.map((t) => (
        <Chip
          key={t}
          size="sm"
          handleRemove={disabled ? undefined : () => onChange(value.filter((x) => x !== t))}
        >
          {t}
        </Chip>
      ))}
      <input
        {...inputProps}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => draft && commit(draft)}
        disabled={disabled}
        placeholder={value.length ? "" : "Add tags…"}
      />
    </div>
  );
}
