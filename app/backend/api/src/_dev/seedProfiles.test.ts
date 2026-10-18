import { describe, expect, it } from "vitest";
import { isLocalDatabaseUrl, profileFromArgv } from "./seedProfiles";

describe("profileFromArgv", () => {
  it("defaults to the public-domain profile", () => {
    expect(profileFromArgv([])).toBe("default");
  });

  it("reads both flag spellings", () => {
    expect(profileFromArgv(["--profile", "baseline"])).toBe("baseline");
    expect(profileFromArgv(["--profile=demo"])).toBe("demo");
  });

  it("rejects an unknown or missing profile name", () => {
    expect(() => profileFromArgv(["--profile", "prod"])).toThrow(/unknown seed profile "prod"/);
    expect(() => profileFromArgv(["--profile"])).toThrow(/unknown seed profile ""/);
    expect(() => profileFromArgv(["--profile=toString"])).toThrow(/unknown seed profile/);
  });
});

describe("isLocalDatabaseUrl", () => {
  it.each([
    "postgresql://u:p@localhost:5433/rhymelab",
    "postgresql://u:p@127.0.0.1/rhymelab",
    "postgresql://u:p@[::1]:5432/rhymelab",
  ])("accepts %s", (url) => {
    expect(isLocalDatabaseUrl(url)).toBe(true);
  });

  it.each([
    "postgresql://u:p@ep-cool-name.neon.tech/rhymelab",
    "postgresql://u:p@localhost.evil.example/rhymelab",
    "not a url",
    "",
  ])("rejects %s", (url) => {
    expect(isLocalDatabaseUrl(url)).toBe(false);
  });
});
