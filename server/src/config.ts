/**
 * Server-side configuration.
 *
 * Everything here is read from the process environment at boot. `GEMINI_API_KEY`
 * never leaves this module's consumers (the Gemini client) — it is never
 * echoed into responses, logs, or frontend environment variables.
 */

export interface ServerConfig {
  port: number;
  /** Browser origins allowed by CORS (`*` or an explicit list). */
  corsOrigins: string[];
  /**
   * Gemini model id. Comes from `GEMINI_MODEL`; when it is unset the Gemini
   * client discovers a model actually available to the configured API account
   * instead of trusting a hardcoded identifier.
   */
  model: string | undefined;
  apiKey: string | undefined;
  /** Max request body size, e.g. "32kb". */
  bodyLimit: string;
  rateLimit: { windowMs: number; max: number };
  /** Upper bound on a single Gemini call. */
  requestTimeoutMs: number;
}

const DEFAULT_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"];

function intOr(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const raw = env[key];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const origins = (env.CORS_ORIGIN ?? "").trim();
  const corsOrigins =
    origins === "*"
      ? ["*"]
      : origins.length > 0
        ? origins
            .split(",")
            .map((origin) => origin.trim())
            .filter(Boolean)
        : DEFAULT_ORIGINS;

  return {
    port: intOr(env, "PORT", 8787),
    corsOrigins,
    model: env.GEMINI_MODEL?.trim() || undefined,
    apiKey: env.GEMINI_API_KEY?.trim() || undefined,
    bodyLimit: (env.AI_BODY_LIMIT ?? "").trim() || "32kb",
    rateLimit: {
      windowMs: intOr(env, "AI_RATE_LIMIT_WINDOW_MS", 60_000),
      max: intOr(env, "AI_RATE_LIMIT_MAX", 20),
    },
    requestTimeoutMs: intOr(env, "GEMINI_TIMEOUT_MS", 60_000),
  };
}
