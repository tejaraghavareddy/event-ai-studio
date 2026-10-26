/**
 * The Express app: five POST endpoints, one shared pipeline.
 *
 *   CORS → rate limit → body-size limit → request validation → Gemini →
 *   model-output validation → typed JSON envelope
 *
 * Failures always come back as `{ ok: false, error: { code, message } }` with
 * a meaningful status; a failed AI call is never dressed up as success.
 */

import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import type { ServerConfig } from "./config";
import { AppError } from "./errors";
import type { GeminiGenerator } from "./gemini";
import { buildPrompt } from "./prompt";
import { createRateLimiter } from "./rateLimit";
import {
  DATA_SCHEMAS,
  ENDPOINT_NAMES,
  errorEnvelope,
  extractJson,
  planHasContent,
  requestSchemaFor,
  type PlanKind,
} from "./schemas";

export interface AppDependencies {
  config: ServerConfig;
  generator: GeminiGenerator;
  /** Injectable clock for rate-limit tests. */
  now?: () => number;
}

/** Keeps the secret out of every log line and response body. */
function redact(message: string, secret: string | undefined): string {
  return secret ? message.split(secret).join("[redacted]") : message;
}

export function createApp(deps: AppDependencies): express.Express {
  const { config, generator } = deps;
  const app = express();

  app.disable("x-powered-by");

  const limiter = createRateLimiter({ ...config.rateLimit, now: deps.now });

  app.use(
    cors({
      origin: config.corsOrigins.includes("*") ? true : config.corsOrigins,
      methods: ["POST", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Accept"],
      maxAge: 600,
    }),
  );
  app.use("/api/gemini", limiter.middleware);
  app.use(express.json({ limit: config.bodyLimit }));

  for (const endpoint of ENDPOINT_NAMES) {
    app.post(`/api/gemini/${endpoint}`, async (req, res, next) => {
      try {
        const parsed = requestSchemaFor(endpoint).safeParse(req.body);
        if (!parsed.success) {
          const issue = parsed.error.issues[0];
          const where = issue?.path.join(".") || "request";
          throw new AppError(
            "VALIDATION_ERROR",
            400,
            `${where}: ${issue?.message ?? "invalid value"}`,
          );
        }

        if (!config.apiKey) {
          throw new AppError(
            "SERVER_MISCONFIGURED",
            503,
            "GEMINI_API_KEY is not set on the server. Copy .env.example to .env, add your Google AI Studio key, and restart the server.",
          );
        }

        const { kind, ...context } = parsed.data;
        const { text, model } = await generator({
          kind,
          prompt: buildPrompt(kind, context),
        });
        const data = parseModelOutput(kind, text);

        res.json({ ok: true, kind, model, data });
      } catch (error) {
        next(error);
      }
    });
  }

  app.use((req, res) => {
    res
      .status(404)
      .json(
        errorEnvelope(
          "VALIDATION_ERROR",
          `Unknown endpoint ${req.method} ${req.path}. Use POST /api/gemini/{plan|budget|timeline|vendors|ideas}.`,
        ),
      );
  });

  app.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      next(error);
      return;
    }

    const appError =
      error instanceof AppError
        ? error
        : isBodyTooLarge(error)
          ? new AppError(
              "PAYLOAD_TOO_LARGE",
              413,
              `Request body exceeds the ${config.bodyLimit} limit.`,
            )
          : isInvalidJson(error)
            ? new AppError("INVALID_JSON", 400, "Request body is not valid JSON.")
            : new AppError(
                "INTERNAL",
                500,
                "The AI server hit an unexpected error. Check its logs and retry.",
              );

    const line = `[celebre/server] ${appError.code} ${appError.status} ${redact(appError.message, config.apiKey)}`;
    if (appError.status >= 500) console.error(line);
    else console.warn(line);

    res.status(appError.status).json(errorEnvelope(appError.code, appError.message));
  });

  return app;
}

/* --------------------------------------------------------- model output */


function parseModelOutput(kind: PlanKind, text: string): unknown {
  let json: unknown;
  try {
    json = extractJson(text);
  } catch (error) {
    throw new AppError(
      "BAD_MODEL_OUTPUT",
      502,
      error instanceof Error ? error.message : "The model's response was not JSON.",
    );
  }

  const result = DATA_SCHEMAS[kind].safeParse(json);
  if (!result.success) {
    const issue = result.error.issues[0];
    const where = issue?.path.join(".") || "response";
    throw new AppError(
      "BAD_MODEL_OUTPUT",
      502,
      `Gemini returned data that doesn't match the expected ${kind} structure (${where}: ${issue?.message ?? "invalid value"}). Try regenerating.`,
    );
  }

  if (kind === "plan" && !planHasContent(result.data)) {
    throw new AppError(
      "BAD_MODEL_OUTPUT",
      502,
      "Gemini returned an empty plan. Add more direction and regenerate.",
    );
  }

  return result.data;
}

function isBodyTooLarge(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "type" in error &&
    (error as { type?: unknown }).type === "entity.too.large"
  );
}

function isInvalidJson(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  if ((error as { type?: unknown }).type === "entity.parse.failed") return true;
  return error instanceof SyntaxError && "body" in error;
}
