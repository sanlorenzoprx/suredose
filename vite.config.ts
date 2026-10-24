import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
// @ts-expect-error JS plugin alongside the TS vite config
import { grokPwaPlugin } from "./scripts/grok-pwa-plugin.mjs";
// @ts-expect-error JS plugin alongside the TS vite config
import { appEnvPlugin } from "./scripts/app-env-plugin.mjs";

// `0.0.0.0:8080` is the live-preview contract — don't change host/port.
// The dev server starts once `src/router.tsx` and `src/routes/` exist — see
// AGENTS.md § "First scaffold".
export default defineConfig(({ command, isPreview }) => ({
  server: {
    host: "0.0.0.0",
    port: 8080,
    strictPort: true,
  },
  preview: {
    host: "127.0.0.1",
    port: 8081,
    strictPort: true,
  },
  resolve: { tsconfigPaths: true },
  plugins: [
    // Dev-only /__app-env, read by scripts/check-auth-invariant.mjs.
    appEnvPlugin(),
    // PWA head + ?install=1 tutorial page; runs before Start/Nitro.
    grokPwaPlugin(),
    tailwindcss(),
    tanstackStart(),
    ...(command === "build" || isPreview
      ? [
          nitro({
            preset: "cloudflare_module",
            // Auto-registers server/middleware/* (the PWA install page +
            // manifest + head-tag middleware) and server/tasks/* (the
            // missed-dose check, see server/tasks/care/missed-doses.ts).
            serverDir: "./server",
            experimental: { tasks: true },
            // Cloudflare Cron Triggers, wired up automatically at build time
            // — no manual wrangler.toml [triggers] section needed. Runs
            // every 15 minutes; each run only pushes an alert for a dose
            // that just crossed its grace period, so this cadence is a
            // reminder-latency setting, not a spam risk.
            scheduledTasks: { "*/15 * * * *": ["care:missed-doses"] },
          }),
        ]
      : []),
    viteReact(),
  ],
}));
