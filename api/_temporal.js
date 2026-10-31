// The Temporal client for /api/checkin (ADR-006). Lazy and module-scoped: a warm serverless
// instance reuses one connection, and a cold one pays the connect once.
//
// Environment (names only): TEMPORAL_ADDRESS, TEMPORAL_NAMESPACE, TEMPORAL_API_KEY (Cloud),
// CHECKIN_CODEC_KEY (encrypts payloads). Without the first two the feature is off; without an API
// key the connection is plain gRPC, which is what `temporal server start-dev` on localhost speaks.

import {
  ApplicationFailure,
  Client,
  Connection,
  WorkflowNotFoundError,
  WorkflowUpdateFailedError,
  WorkflowUpdateRPCTimeoutOrCancelledError,
  isGrpcDeadlineError,
  isGrpcServiceError,
} from '@temporalio/client';
import { FAILURE_TYPES } from '../mcp/dist/shared/checkin-contract.js';
import { createEncryptionCodec } from '../mcp/dist/shared/temporal-codec.js';

const CONNECT_TIMEOUT_MS = 5_000;
// gRPC UNAVAILABLE: the server (or the network to it) is down.
const GRPC_UNAVAILABLE = 14;

export function isTemporalConfigured(env = process.env) {
  return Boolean(env.TEMPORAL_ADDRESS && env.TEMPORAL_NAMESPACE);
}

async function connect(env) {
  const apiKey = env.TEMPORAL_API_KEY || undefined;
  // An API key means Temporal Cloud, where payloads must never travel in the clear.
  if (apiKey && !env.CHECKIN_CODEC_KEY) {
    throw new Error('Refusing to connect to Temporal Cloud without CHECKIN_CODEC_KEY.');
  }
  const connection = await Connection.connect({
    address: env.TEMPORAL_ADDRESS,
    // Temporal Cloud needs TLS with the API key; the local dev server has neither.
    ...(apiKey ? { tls: true, apiKey } : {}),
    connectTimeout: CONNECT_TIMEOUT_MS,
  });
  const payloadCodecs = env.CHECKIN_CODEC_KEY ? [createEncryptionCodec({ key: env.CHECKIN_CODEC_KEY })] : [];
  return new Client({ connection, namespace: env.TEMPORAL_NAMESPACE, dataConverter: { payloadCodecs } });
}

let clientPromise = null;

/** One shared client. A failed connect is not cached, so the next request tries again. */
export function getTemporalClient(env = process.env) {
  if (!clientPromise) {
    clientPromise = connect(env).catch((error) => {
      clientPromise = null;
      throw error;
    });
  }
  return clientPromise;
}

class TemporalTimeoutError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TemporalTimeoutError';
  }
}

/**
 * Runs `fn` with a gRPC deadline on every Temporal request it makes, so a missing worker or a
 * stalled server cannot hold the function open until Vercel kills it. The race is a backstop for
 * a client that does not honour the deadline.
 */
export async function withTemporalDeadline(client, ms, fn) {
  let timer;
  const backstop = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new TemporalTimeoutError('Temporal call timed out.')), ms + 2_000);
  });
  try {
    return await Promise.race([client.connection.withDeadline(Date.now() + ms, fn), backstop]);
  } finally {
    clearTimeout(timer);
  }
}

const REFUSAL_TYPES = new Set([FAILURE_TYPES.badRequest, FAILURE_TYPES.notFound, FAILURE_TYPES.conflict]);

// The first ApplicationFailure on the cause chain, with how deep it sits (1 = the update's own cause).
function firstApplicationFailure(error) {
  let cause = error?.cause;
  for (let depth = 1; cause && depth <= 6; depth += 1) {
    if (cause instanceof ApplicationFailure) return { failure: cause, depth };
    cause = cause.cause;
  }
  return null;
}

/**
 * Sorts a Temporal error into what the API should say:
 *   not_found   the workflow does not exist (the feature is off for this user)
 *   rejected    the update was refused for good: a validator or handler threw an ApplicationFailure, or
 *               an activity failed non-retryably with BadRequest, NotFound or Conflict (see
 *               FAILURE_TYPES in the contract). A 409.
 *   ineligible  an activity failed non-retryably with NotEligible. A 403.
 *   offline     no worker answered in time, or the server is unreachable
 *   failed      the update ran and failed on the way (an activity gave up on a temporary error)
 *   error       anything else
 */
export function classifyTemporalError(error) {
  if (error instanceof WorkflowNotFoundError) return 'not_found';
  if (error instanceof WorkflowUpdateFailedError) {
    const found = firstApplicationFailure(error);
    if (!found) return 'failed';
    if (found.failure.type === FAILURE_TYPES.notEligible) return 'ineligible';
    // A validator or the handler itself refused (depth 1), or an activity gave a permanent answer.
    if (found.depth === 1 || REFUSAL_TYPES.has(found.failure.type)) return 'rejected';
    return 'failed';
  }
  if (
    error instanceof WorkflowUpdateRPCTimeoutOrCancelledError ||
    error instanceof TemporalTimeoutError ||
    isGrpcDeadlineError(error) ||
    (isGrpcServiceError(error) && error.code === GRPC_UNAVAILABLE) ||
    (isGrpcServiceError(error?.cause) && error.cause.code === GRPC_UNAVAILABLE)
  ) {
    return 'offline';
  }
  return 'error';
}
