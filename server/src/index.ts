/**
 * Entry point for the Celebré Gemini backend.
 *
 *   bun run server     # or: node --experimental-strip-types server/src/index.ts
 *
 * Secrets come from `.env` / the process environment only. Nothing in here is
 * ever shipped to the browser — the frontend talks to these endpoints and
 * receives validated JSON.
 */

import { config as loadDotenv } from "dotenv";
import { createApp } from "./app";
import { loadConfig } from "./config";
import { AppError } from "./errors";
import { createGeminiGenerator, type GeminiGenerator } from "./gemini";

loadDotenv({ quiet: true });
loadDotenv({ path: ".env.local", quiet: true, override: true });

const config = loadConfig();

const generator: GeminiGenerator = config.apiKey
  ? createGeminiGenerator({
      apiKey: config.apiKey,
      model: config.model,
      timeoutMs: config.requestTimeoutMs,
    })
  : async () => {
      throw new AppError(
        "SERVER_MISCONFIGURED",
        503,
        "GEMINI_API_KEY is not set on the server. Copy .env.example to .env, add your Google AI Studio key, and restart.",
      );
    };

const app = createApp({ config, generator });

const server = app.listen(config.port, "0.0.0.0", () => {
  console.log(`[celebre/server] listening on http://localhost:${config.port}`);
  console.log(`[celebre/server] model: ${config.model ?? "auto-discovered from the API account"}`);
  console.log(
    `[celebre/server] cors: ${config.corsOrigins.join(", ")} · rate limit: ${config.rateLimit.max} requests / ${Math.round(config.rateLimit.windowMs / 1000)}s · body limit: ${config.bodyLimit}`,
  );
  console.log(
    `[celebre/server] GEMINI_API_KEY: ${config.apiKey ? "loaded from environment" : "MISSING — AI requests will fail with a clear error"}`,
  );
});

server.on("error", (error) => {
  console.error("[celebre/server] failed to start:", error.message);
  process.exit(1);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
