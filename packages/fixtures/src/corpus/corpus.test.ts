import { describe, expect, it } from "vitest";
import { parseAnnotatedBody } from "../parseAnnotatedBody";
import { CORPUS } from ".";

describe("CORPUS", () => {
  it("has unique titles", () => {
    const titles = CORPUS.map((entry) => entry.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it.each(CORPUS.map((entry) => [entry.title, entry] as const))(
    "%s annotates every line",
    (_title, entry) => {
      const { body, annotations } = parseAnnotatedBody(entry.annotated);
      const contentLines = body.split("\n").filter((line) => line !== "");
      expect(annotations).toHaveLength(contentLines.length);
    },
  );
});
