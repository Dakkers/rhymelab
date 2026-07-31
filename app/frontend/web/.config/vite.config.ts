import { defineConfig, type Plugin } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";

// `vanillaExtractPlugin()` unconditionally declares `ssr.external` for the
// `@vanilla-extract/css` runtime, and the Cloudflare plugin hard-errors on any
// `resolve.external` inside a Worker environment. The externals aren't needed
// here: in the plugin's default `emitCss` mode every `*.css.ts` is evaluated at
// build time and replaced with plain class-name strings plus a CSS import, so
// the VE runtime never reaches the worker bundle in the first place.
//
// The `config` hook can't simply be dropped — it also captures the `ConfigEnv`
// the compiler later needs — so call through and discard only its return value.
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

// SSR runtime = Cloudflare Workers. The `cloudflare` plugin runs the built
// worker inside miniflare/workerd for `vite dev` and `vite preview`, so the dev
// server executes the *same* runtime you deploy to — no Node-vs-Worker drift.
// `tanstackStart()` wires up the SSR + file-based router; `viteReact()` adds
// Fast Refresh. Path aliases (`#/*`) come from tsconfig via `tsconfigPaths`.
//
// This file lives in `.config/`, but Vite's `root` stays the project root — it
// defaults to the cwd, not to the config file's directory. So every path below
// is written relative to the project root, hence the `.config/` prefixes.
export default defineConfig({
  // `.env*` files live alongside this config rather than in the project root.
  envDir: ".config",
  resolve: { tsconfigPaths: true },
  server: {
    // Routes are code-split, so Vite doesn't discover a route's deps until you
    // first navigate to it — at which point it optimizes them and force-reloads
    // the page to apply the new bundle. On the workbench that reload lands
    // mid-interaction and wipes React state, so a click made too early (a
    // recorded flow, or `e2e/rhyme-groups.spec.ts`) is silently lost. Pre-
    // transform the workbench route on server start so its deps are optimized up
    // front — no first-visit reload. Path is relative to Vite's root (the
    // project root / cwd), same as everything else here.
    warmup: {
      clientFiles: ["src/routes/_authenticated/entries/$entryId/index.tsx"],
    },
  },
  plugins: [
    cloudflare({ configPath: "./.config/wrangler.jsonc", viteEnvironment: { name: "ssr" } }),
    tanstackStart(),
    viteReact(),
    // Compiles `*.css.ts` files to real CSS at build time. It re-reads this
    // config to spin up a small child Vite server for evaluating those files,
    // and by default filters *out* every plugin above — `cloudflare` and
    // `tanstackStart` can't run inside that compiler, and don't need to. The
    // `#/*` alias still resolves there because it comes from `resolve`, not a
    // plugin. Keep this last so it sees the fully-transformed module graph.
    vanillaExtract(),
  ],
});
