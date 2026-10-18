import { expect, test } from "vitest";
import { splitSections, UNRHYMED_SENTINEL, type EntrySection } from "@rhymelab/api-contract";
import { db } from "./db";
import { API_URL, dispatchMock } from "./router";

test("getItem resolves a DB-shaped -1 row to an unrhymed line", async () => {
  const [entry, ...rest] = db.entries;
  const firstLine = entry.body.split("\n")[0] ?? "";
  db.entries = [
    {
      ...entry,
      annotations: [
        { lineIndex: 0, quote: firstLine, rhymeGroup: UNRHYMED_SENTINEL, enjambed: false },
      ],
    },
    ...rest,
  ];

  const response = await dispatchMock(new Request(`${API_URL}/entries/${entry.id}`));
  expect(response?.status).toBe(200);

  const body = (await response?.json()) as { sections: EntrySection[] };
  expect(body.sections[0]?.lines[0]).toEqual({
    index: 0,
    text: firstLine,
    rhyme: { group: null, letter: "X", unrhymed: true },
    enjambed: false,
  });
});

test("getItem letters a real group id and leaves a null group unrhymed:false", async () => {
  const [entry, ...rest] = db.entries;
  const lines = splitSections(entry.body)[0]?.split("\n") ?? [];
  expect(lines.length).toBeGreaterThanOrEqual(3);
  const [first = "", second = "", third = ""] = lines;
  db.entries = [
    {
      ...entry,
      annotations: [
        { lineIndex: 0, quote: first, rhymeGroup: UNRHYMED_SENTINEL, enjambed: false },
        { lineIndex: 1, quote: second, rhymeGroup: 3, enjambed: true },
        { lineIndex: 2, quote: third, rhymeGroup: null, enjambed: false },
      ],
    },
    ...rest,
  ];

  const response = await dispatchMock(new Request(`${API_URL}/entries/${entry.id}`));
  expect(response?.status).toBe(200);

  const body = (await response?.json()) as { sections: EntrySection[] };
  expect(body.sections[0]?.lines.slice(0, 3)).toEqual([
    {
      index: 0,
      text: first,
      rhyme: { group: null, letter: "X", unrhymed: true },
      enjambed: false,
    },
    {
      index: 1,
      text: second,
      rhyme: { group: 3, letter: "A", unrhymed: false },
      enjambed: true,
    },
    { index: 2, text: third, rhyme: null, enjambed: false },
  ]);
});
