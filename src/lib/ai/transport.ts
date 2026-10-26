/**
 * HTTP transport for the Gemini backend (`server/`).
 *
 * Every AI button in the studio goes through here: a POST to
 * `{base}/{plan|budget|timeline|vendors|ideas}`, typed as an envelope that is
 * parsed before anything is trusted. The base URL is plain configuration —
 * no secret is ever present in a `VITE_` variable or in this module.
 *
 * When no backend has been configured and none is listening, `unreachable`
 * tells the caller that the request never hit an AI server at all (as opposed
 * to the server rejecting it), so the caller can decide what to do.
 */

import { z } from "zod";

export type PlanKind =
  | "plan"
  | "budget"
  | "timeline"
  | "vendors"
  | "questions"
  | "ideas"
  | "concept";

export type EndpointName = "plan" | "budget" | "timeline" | "vendors" | "ideas";

/** Which endpoint owns which task (the server validates this mapping too). */
const KIND_TO_ENDPOINT: Record<PlanKind, EndpointName> = {
  plan: "plan",
  budget: "budget",
  timeline: "timeline",
  vendors: "vendors",
  questions: "vendors",
  ideas: "ideas",
  concept: "ideas",
};

export function endpointForKind(kind: PlanKind): EndpointName {
  return KIND_TO_ENDPOINT[kind] ?? "plan";
}

export const DEFAULT_AI_BASE = "http://localhost:8787/api/gemini";

export interface AiBase {
  base: string;
  /** True when the base was set explicitly (VITE_AI_API_BASE). */
  explicit: boolean;
}

export function resolveAiBase(
  env: Record<string, unknown> = import.meta.env as Record<string, unknown>,
): AiBase {
  const raw = typeof env.VITE_AI_API_BASE === "string" ? env.VITE_AI_API_BASE.trim() : "";
  return raw
    ? { base: raw.replace(/\/+$/, ""), explicit: true }
    : { base: DEFAULT_AI_BASE, explicit: false };
}

const successEnvelope = z.object({
  ok: z.literal(true),
  kind: z.string(),
  model: z.string().optional(),
  data: z.unknown(),
});

const errorEnvelope = z.object({
  ok: z.literal(false),
  error: z.object({ code: z.string(), message: z.string().min(1) }),
});

export type TransportResult =
  | { ok: true; data: unknown; model?: string }
  | { ok: false; error: string; unreachable: boolean };

export interface CallOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Posts one request to the backend.
 *
 * - a valid envelope (success or error) is returned as-is;
 * - a network failure or a non-envelope response (a dev-server 404, a proxy
 *   page) is marked `unreachable` so the caller knows no AI server answered.
 */
export async function callGemini<TPayload extends object>(
  kind: PlanKind,
  payload: TPayload,
  options: CallOptions = {},
): Promise<TransportResult> {
  const { base } = resolveAiBase();
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = `${base}/${endpointForKind(kind)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 180_000);

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ ...payload, kind }),
      signal: controller.signal,
    });
  } catch {
    return {
      ok: false,
      error: `Could not reach the AI server at ${base}. Start it with \`bun run server\`, or set VITE_AI_API_BASE to where it runs.`,
      unreachable: true,
    };
  } finally {
    clearTimeout(timer);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }

  const success = successEnvelope.safeParse(body);
  if (success.success) {
    return { ok: true, data: success.data.data, model: success.data.model };
  }

  const failure = errorEnvelope.safeParse(body);
  if (failure.success) {
    return { ok: false, error: failure.data.error.message, unreachable: false };
  }

  return {
    ok: false,
    error: `The AI server at ${base} answered with an unexpected response (HTTP ${response.status}).`,
    unreachable: true,
  };
}
