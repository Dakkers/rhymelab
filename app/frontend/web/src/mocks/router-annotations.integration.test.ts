import { expect, test } from "vitest";
import { UNRHYMED_SENTINEL } from "@rhymelab/api-contract";
import { db } from "./db";
import { API_URL, dispatchMock } from "./router";

test("getItem resolves a DB-shaped -1 row to unrhymed:true", async () => {
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

  const body = (await response?.json()) as { annotations: unknown[] };
  expect(body.annotations).toEqual([
    { lineIndex: 0, quote: firstLine, rhymeGroup: null, unrhymed: true, enjambed: false },
  ]);
});

test("getItem passes a real group id and null through with unrhymed:false", async () => {
  const [entry, ...rest] = db.entries;
  const lines = entry.body.split("\n");
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

  const body = (await response?.json()) as { annotations: unknown[] };
  expect(body.annotations).toEqual([
    { lineIndex: 0, quote: first, rhymeGroup: null, unrhymed: true, enjambed: false },
    { lineIndex: 1, quote: second, rhymeGroup: 3, unrhymed: false, enjambed: true },
    { lineIndex: 2, quote: third, rhymeGroup: null, unrhymed: false, enjambed: false },
  ]);
});
