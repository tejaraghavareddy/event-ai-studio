/**
 * The only place `GEMINI_API_KEY` is used.
 *
 * The model id comes from `GEMINI_MODEL`. When it is unset the server asks
 * the Generative Language API which models the configured account can actually
 * use and picks a flash model, so no unverified identifier is baked into the
 * code path. Failures surface as typed `AppError`s — a failed call is never
 * replaced with made-up content.
 */

import { GoogleGenAI } from "@google/genai";
import { AppError } from "./errors";
import { SYSTEM_INSTRUCTION } from "./prompt";
import type { PlanKind } from "./schemas";

export interface GenerateArgs {
  kind: PlanKind;
  prompt: string;
}

export interface GenerateResult {
  text: string;
  model: string;
}

export type GeminiGenerator = (args: GenerateArgs) => Promise<GenerateResult>;

export interface GeminiOptions {
  apiKey: string;
  /** Explicit model id from `GEMINI_MODEL`; empty means "discover". */
  model?: string;
  timeoutMs: number;
}

/** Last-resort model, only used when discovery itself fails. */
const FALLBACK_MODEL = "gemini-2.5-flash";
const DISCOVERY_URL = "https://generativelanguage.googleapis.com/v1beta/models";

function normalizeModel(name: string): string {
  return name.replace(/^models\//, "").trim();
}

/**
 * Lists the models available to this API key and prefers a stable flash
 * model. Returns `undefined` when the API cannot be reached or answered.
 */
async function discoverModel(apiKey: string): Promise<string | undefined> {
  try {
    const response = await fetch(DISCOVERY_URL, { headers: { "x-goog-api-key": apiKey } });
    if (!response.ok) return undefined;
    const payload = (await response.json()) as {
      models?: Array<{ name?: string; supportedActions?: string[] }>;
    };
    const names = (payload.models ?? [])
      .map((model) => normalizeModel(model.name ?? ""))
      .filter((name) => name.startsWith("gemini-"))
      .filter((name, index, all) => all.indexOf(name) === index);
    if (names.length === 0) return undefined;

    const flash = names.filter((name) =>
      /^gemini-[\d.]+-flash(-[\w.]+)?$/.test(name),
    );
    const exactFlash = flash.filter((name) => /^gemini-[\d.]+-flash$/.test(name));
    const pool = exactFlash.length > 0 ? exactFlash : flash.length > 0 ? flash : names;
    pool.sort();
    return pool[pool.length - 1];
  } catch {
    return undefined;
  }
}

/** Maps a Gemini/HTTP failure onto a typed, actionable error. */
export function classifyGeminiError(error: unknown): AppError {
  const raw = error instanceof Error ? error.message : String(error);
  const message = raw.slice(0, 400);

  if (/api key|unauthenticated|401|403|permission/i.test(message)) {
    return new AppError(
      "SERVER_MISCONFIGURED",
      503,
      "Google rejected GEMINI_API_KEY. Check the key on the server's environment, then retry.",
    );
  }
  if (/is not found|404|unsupported model|has no model|unknown model/i.test(message)) {
    return new AppError(
      "MODEL_UNAVAILABLE",
      502,
      "The configured Gemini model is not available to this API key. Set GEMINI_MODEL to a model listed at https://ai.google.dev/gemini-api/docs/models, then retry.",
    );
  }
  if (/429|rate limit|quota|resource_exhausted/i.test(message)) {
    return new AppError(
      "UPSTREAM_ERROR",
      502,
      "Gemini is rate limiting this API key right now. Wait a moment and retry.",
    );
  }
  return new AppError("UPSTREAM_ERROR", 502, `Gemini request failed: ${message}`);
}

export function createGeminiGenerator(options: GeminiOptions): GeminiGenerator {
  const { apiKey, timeoutMs } = options;
  const client = new GoogleGenAI({ apiKey });

  let configured = options.model ? normalizeModel(options.model) : undefined;
  let discovery: Promise<string> | undefined;

  async function resolveModel(): Promise<string> {
    if (configured) return configured;
    discovery ??= discoverModel(apiKey).then((found) => {
      configured = found ?? FALLBACK_MODEL;
      if (!found) {
        console.warn(
          `[celebre/server] could not list models for this API key — defaulting to ${FALLBACK_MODEL}. Set GEMINI_MODEL to override.`,
        );
      }
      return configured;
    });
    return discovery;
  }

  return async ({ prompt }): Promise<GenerateResult> => {
    const model = await resolveModel();

    const request = client.models.generateContent({
      model,
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.65,
        maxOutputTokens: 8192,
        responseMimeType: "application/json",
      },
    });

    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(
          new AppError(
            "TIMEOUT",
            504,
            `Gemini did not respond within ${Math.round(timeoutMs / 1000)}s. Retry, or raise GEMINI_TIMEOUT_MS.`,
          ),
        );
      }, timeoutMs);
    });

    try {
      const response = await Promise.race([request, timeout]);
      const text = response.text?.trim();
      if (!text) {
        throw new AppError(
          "BAD_MODEL_OUTPUT",
          502,
          "Gemini returned an empty response — this usually means a safety filter tripped. Adjust your direction and retry.",
        );
      }
      return { text, model };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw classifyGeminiError(error);
    } finally {
      if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
    }
  };
}
