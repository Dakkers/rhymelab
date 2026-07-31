import { Combobox, Flex, Select, TextInput } from "@saintly-software/baritone";
import { ENTRY_KINDS, type EntryKind } from "@rhymelab/core";
import type { EntryDetail } from "@rhymelab/api-contract";

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
        onChange={(value) => onChange({ title: value })}
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
          onChange={(value) => onChange({ year: value })}
          disabled={disabled}
          placeholder="e.g. 1845"
        />
      </div>

      <div className="rl-form-grid">
        <TextInput
          label={artistLabel}
          value={value.artist}
          onChange={(value) => onChange({ artist: value })}
          disabled={disabled}
        />
        <TextInput
          label={collectionLabel}
          value={value.collection}
          onChange={(value) => onChange({ collection: value })}
          disabled={disabled}
        />
      </div>

      {/*
        Tags are open-ended, so there's no fixed option list: `freeText` is what
        actually commits a value, and the options are the tags already chosen.
        Feeding them back in isn't decorative — Combobox hides the "Add …" row
        when the query case-insensitively matches an option, which is what stops
        "rap" and "Rap" from both landing on the same entry.
      */}
      <Combobox
        multiple
        freeText
        label="Tags"
        options={value.tags.map((t) => ({ value: t, label: t }))}
        value={value.tags}
        onValueChange={(tags) => onChange({ tags })}
        disabled={disabled}
        hideClearButton={!value.tags.length}
        placeholder={value.tags.length ? undefined : "Add tags…"}
      />

      <TextInput
        multiline
        rows={4}
        label="Notes"
        value={value.notes}
        onChange={(value) => onChange({ notes: value })}
        disabled={disabled}
        placeholder="Anything worth remembering about this piece…"
      />
    </Flex>
  );
}
