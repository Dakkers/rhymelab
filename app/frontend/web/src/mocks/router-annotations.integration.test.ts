/**
 * Regression coverage for the annotation sentinel transform at the mock's real
 * oRPC boundary (`dispatchMock` → the contract's `readLyricEntryDetailSchema`
 * output validation). `getItem` must resolve the DB's `-1` sentinel to
 * `unrhymed: true` exactly once — not lose it to a double parse.
 */
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
