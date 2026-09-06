import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: withUtcTimeZone(process.env["DATABASE_URL"]),
  },
});

function withUtcTimeZone(url: string | undefined): string | undefined {
  if (!url) return url;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }

  if (parsed.searchParams.has("options")) return url;

  const separator = parsed.search ? "&" : "?";
  return `${url}${separator}options=${encodeURIComponent(UTC_OPTIONS)}`;
}

const UTC_OPTIONS = "-c TimeZone=UTC";
