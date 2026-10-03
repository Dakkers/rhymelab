import type { ReadLineAnnotation } from "@rhymelab/api-contract";
import type { SheetSection } from "#/components/LyricSections";

/**
 * Letter each annotated line by its rhyme group, keyed by song-wide line index.
 * Letters restart at "A" in every section, in order of first appearance.
 * Unrhymed lines are "X". Lines with no rhyme group are absent.
 */
export function letterLines(
  sections: readonly SheetSection[],
  annotations: readonly Pick<ReadLineAnnotation, "lineIndex" | "rhymeGroup" | "unrhymed">[],
): ReadonlyMap<number, string> {
  const byLine = new Map(annotations.map((annotation) => [annotation.lineIndex, annotation]));
  const letters = new Map<number, string>();

  for (const section of sections) {
    const sectionLetters = new Map<number, string>();
    for (const { globalIndex } of section.lines) {
      const annotation = byLine.get(globalIndex);
      if (!annotation) continue;
      if (annotation.unrhymed) {
        letters.set(globalIndex, "X");
        continue;
      }
      if (annotation.rhymeGroup === null) continue;
      let letter = sectionLetters.get(annotation.rhymeGroup);
      if (letter === undefined) {
        letter = toLetters(sectionLetters.size);
        sectionLetters.set(annotation.rhymeGroup, letter);
      }
      letters.set(globalIndex, letter);
    }
  }

  return letters;
}

function toLetters(ordinal: number): string {
  let label = "";
  for (let n = ordinal + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    label = String.fromCharCode(65 + ((n - 1) % 26)) + label;
  }
  return label;
}
