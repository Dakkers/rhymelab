import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, expect, test } from "vitest";
import { UNRHYMED_SENTINEL } from "@rhymelab/api-contract";
import { buildServer } from "../../app/buildServer";
import { COOKIE_NAME, COOKIE_VALUE, TEMP_USER_ID } from "../../app/session";
import { prisma, RUN } from "../../test-support/integration-db";

let app: FastifyInstance;
let createdUser = false;

beforeAll(async () => {
  app = await buildServer({ db: prisma });
  if (!(await prisma.user.findUnique({ where: { id: TEMP_USER_ID } }))) {
    await prisma.user.create({
      data: { id: TEMP_USER_ID, email: `${RUN}@example.test`, displayName: RUN, passwordHash: "-" },
    });
    createdUser = true;
  }
});

afterAll(async () => {
  await prisma.lyricEntry.deleteMany({ where: { title: { startsWith: RUN } } });
  if (createdUser) await prisma.user.delete({ where: { id: TEMP_USER_ID } });
  await app.close();
});

test("getItem returns stored annotations ordered by line, with unrhymed resolved", async () => {
  const entry = await prisma.lyricEntry.create({
    data: {
      userId: TEMP_USER_ID,
      kind: "poem",
      title: `${RUN} getItem`,
      body: "first line\nsecond line\n\nthird line",
      structure: ["verse", "verse"],
      annotations: {
        create: [
          { lineIndex: 3, quote: "third line", rhymeGroup: 1, enjambed: false },
          { lineIndex: 0, quote: "first line", rhymeGroup: 1, enjambed: true },
          { lineIndex: 1, quote: "second line", rhymeGroup: UNRHYMED_SENTINEL, enjambed: false },
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
  expect(response.json().annotations).toEqual([
    { lineIndex: 0, quote: "first line", rhymeGroup: 1, unrhymed: false, enjambed: true },
    { lineIndex: 1, quote: "second line", rhymeGroup: null, unrhymed: true, enjambed: false },
    { lineIndex: 3, quote: "third line", rhymeGroup: 1, unrhymed: false, enjambed: false },
  ]);
});
