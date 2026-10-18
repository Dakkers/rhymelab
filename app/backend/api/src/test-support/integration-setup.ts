import { afterAll } from "vitest";
import { prisma } from "./integration-db";

afterAll(async () => {
  await prisma.$disconnect();
});
