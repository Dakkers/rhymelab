import { defineConfig, type Plugin } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";

function vanillaExtract(): Plugin[] {
  return vanillaExtractPlugin().map((plugin) => {
    if (typeof plugin.config !== "function") return plugin;
    const config = plugin.config;
    return {
      ...plugin,
      config(...args: Parameters<typeof config>) {
        config.apply(this, args);
        return null;
      },
    } as Plugin;
  });
}

export default defineConfig({
  envDir: ".config",
  resolve: { tsconfigPaths: true },
  server: {
    warmup: {
      clientFiles: ["src/routes/_authenticated/entries/$entryId/index.tsx"],
    },
  },
  plugins: [
    cloudflare({ configPath: "./.config/wrangler.jsonc", viteEnvironment: { name: "ssr" } }),
    tanstackStart(),
    viteReact(),
    vanillaExtract(),
  ],
});
