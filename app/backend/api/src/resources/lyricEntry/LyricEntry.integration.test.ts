import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, expect, test } from "vitest";
import { UNRHYMED_SENTINEL } from "@rhymelab/api-contract";
import { buildServer } from "../../app/buildServer";
import { COOKIE_NAME, COOKIE_VALUE, TEMP_USER_ID } from "../../app/session";
import { prisma } from "../../test-support/integration-db";

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildServer({ db: prisma });
  await prisma.user.create({
    data: {
      id: TEMP_USER_ID,
      email: "itest@example.test",
      displayName: "itest",
      passwordHash: "-",
    },
  });
});

afterAll(async () => {
  await app.close();
});

test("getItem returns sections built from stored annotations, with the unrhymed sentinel resolved", async () => {
  const entry = await prisma.lyricEntry.create({
    data: {
      userId: TEMP_USER_ID,
      kind: "poem",
      title: "getItem",
      body: "first line\nsecond line\n\nthird line\nfourth line",
      structure: ["verse", "verse"],
      annotations: {
        create: [
          { lineIndex: 3, quote: "third line", rhymeGroup: 1, enjambed: false },
          { lineIndex: 0, quote: "first line", rhymeGroup: 1, enjambed: true },
          { lineIndex: 1, quote: "second line", rhymeGroup: UNRHYMED_SENTINEL, enjambed: false },
          { lineIndex: 4, quote: "fourth line", rhymeGroup: null, enjambed: false },
        ],
      },
    },
  });

  const response = await app.inject({
    method: "GET",
    url: `/api/entries/${entry.id}`,
    cookies: { [COOKIE_NAME]: app.signCookie(COOKIE_VALUE) },
  });

  expect(response.statusCode).toBe(200);
  expect(response.json().sections).toEqual([
    {
      type: "verse",
      lines: [
        {
          index: 0,
          text: "first line",
          rhyme: { group: 1, letter: "A", unrhymed: false },
          enjambed: true,
        },
        {
          index: 1,
          text: "second line",
          rhyme: { group: null, letter: "X", unrhymed: true },
          enjambed: false,
        },
      ],
    },
    {
      type: "verse",
      lines: [
        {
          index: 3,
          text: "third line",
          rhyme: { group: 1, letter: "A", unrhymed: false },
          enjambed: false,
        },
        { index: 4, text: "fourth line", rhyme: null, enjambed: false },
      ],
    },
  ]);
});
