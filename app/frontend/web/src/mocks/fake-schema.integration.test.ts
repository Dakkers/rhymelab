/**
 * The mock's stub generator (`fakeSchema`) — the fallback that answers any
 * contract procedure the router doesn't hand-write (see `./router`).
 *
 * These pin the two properties the catch-all relies on: whatever the stub
 * produces is valid against the procedure's *own* output schema, and it's stable
 * for a fixed seed. The last test pins the "minimal" intent, so a stub stays an
 * obvious placeholder rather than plausible-looking data.
 */
import { expect, test } from "vitest";
import { contract, EntryDetailSchema } from "@rhymelab/api-contract";
import type { z } from "zod";
import { fakeSchema } from "./fake-schema";

/** Pull the output schema off a contract procedure, the way the router does. */
function outputSchemaOf(procedure: unknown): z.ZodType | undefined {
  return (procedure as { "~orpc"?: { outputSchema?: z.ZodType } })["~orpc"]?.outputSchema;
}

test("produces a value valid against every contract procedure's output schema", () => {
  const procedures = Object.values(contract).flatMap((namespace) => Object.values(namespace));
  // Guard against an empty walk silently passing.
  expect(procedures.length).toBeGreaterThan(0);

  for (const procedure of procedures) {
    const schema = outputSchemaOf(procedure);
    if (!schema) continue;
    expect(schema.safeParse(fakeSchema(schema)).success).toBe(true);
  }
});

test("is deterministic for a fixed seed", () => {
  expect(fakeSchema(EntryDetailSchema, 7)).toEqual(fakeSchema(EntryDetailSchema, 7));
});

test("empties everything the schema allows, so a stub reads as a placeholder", () => {
  const detail = fakeSchema(EntryDetailSchema) as Record<string, unknown>;
  // No minimum on `author`, and `year` is optional, so the stub leaves them bare.
  expect(detail.author).toEqual([]);
  expect(detail.year).toBeUndefined();
  expect(EntryDetailSchema.safeParse(detail).success).toBe(true);
});
