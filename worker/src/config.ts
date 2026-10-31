// Environment -> Temporal connection settings, shared by the worker and the dev scripts so they
// can never disagree (a worker with the codec and a script without it would see garbage).
//
// Names only here; values live in worker/.env (gitignored) or the shell. See worker/.env.example.

import { fileURLToPath } from "node:url";
import type { DataConverter } from "@temporalio/common";
import { createEncryptionCodec } from "../../shared/temporal-codec.js";
import { temporalEnvSchema, workerEnvSchema } from "./schemas.js";

export interface TemporalConfig {
  address: string;
  namespace: string;
  /** Present for Temporal Cloud. Its presence also switches TLS on. */
  apiKey?: string;
  /** Base64 of 32 random bytes. Present means payloads are encrypted. */
  codecKey?: string;
}

export const DEFAULT_ADDRESS = "localhost:7233";
export const DEFAULT_NAMESPACE = "default";

export function readTemporalConfig(env: NodeJS.ProcessEnv = process.env): TemporalConfig {
  const parsed = temporalEnvSchema.parse(env);
  const apiKey = parsed.TEMPORAL_API_KEY;
  const codecKey = parsed.CHECKIN_CODEC_KEY;
  // Same rule as the API client (api/_temporal.js): Cloud means ciphertext only.
  if (apiKey && !codecKey) {
    throw new Error("Refusing to connect to Temporal Cloud without CHECKIN_CODEC_KEY.");
  }
  return {
    address: parsed.TEMPORAL_ADDRESS || DEFAULT_ADDRESS,
    namespace: parsed.TEMPORAL_NAMESPACE || DEFAULT_NAMESPACE,
    apiKey,
    codecKey,
  };
}

/** The two variables the worker cannot start without. Throws one readable error listing what is wrong. */
export function readWorkerEnv(env: NodeJS.ProcessEnv = process.env): { apiUrl: string; secret: string } {
  const parsed = workerEnvSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((issue) => issue.message).join(" "));
  }
  return { apiUrl: parsed.data.SWOLTRACKER_API_URL, secret: parsed.data.CHECKIN_WORKER_SECRET };
}

/** Options common to NativeConnection.connect (worker) and Connection.connect (client). */
export function connectionOptions(config: TemporalConfig): { address: string; tls?: true; apiKey?: string } {
  // Temporal Cloud needs TLS with the API key; the local dev server has neither.
  return config.apiKey ? { address: config.address, tls: true, apiKey: config.apiKey } : { address: config.address };
}

// These two are loaded by file path, so they must point at the file next to this one in both
// layouts: .ts when running from source (tsx, vitest) and .js when running compiled output.
const sibling = (name: string) => fileURLToPath(new URL(name, import.meta.url));
const sourceExt = import.meta.url.endsWith(".ts") ? ".ts" : ".js";

/** The entry module the worker bundles for the workflow sandbox. */
export const WORKFLOWS_PATH = sibling(`./workflows/index${sourceExt}`);
const FAILURE_CONVERTER_PATH = sibling("./failure-converter.cjs");

export function dataConverterFor(config: TemporalConfig): DataConverter {
  if (!config.codecKey) return {};
  return {
    payloadCodecs: [createEncryptionCodec({ key: config.codecKey })],
    failureConverterPath: FAILURE_CONVERTER_PATH,
  };
}

/**
 * Whether the dev-only `devFastForward` workflow input may be honoured. Never in production
 * (NODE_ENV=production, which `npm start` sets) and never against Temporal Cloud (a TEMPORAL_API_KEY
 * means this worker serves real users, whatever NODE_ENV says). See src/workflows/coachLoop.ts.
 */
export function devFastForwardAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV !== "production" && !env.TEMPORAL_API_KEY?.trim();
}
