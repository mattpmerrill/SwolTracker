/** Supported MCP transport protocols. */
export type AppTransport = "stdio" | "http" | "sse";
/** An event type declared in the app manifest. */
export interface EventDeclaration {
    name: string;
    description: string;
    schema?: Record<string, unknown>;
}
/** App identity card — used for registration, discovery, and validation. */
export interface AppManifest {
    /** Lowercase kebab-case app identifier (e.g. "counter", "swol-tracker"). */
    name: string;
    /** Semver version string. */
    version: string;
    /** SDK version this app was built with. */
    sdkVersion?: string;
    displayName: string;
    description: string;
    author: string;
    /** Path to SKILL.md relative to app root. */
    skillFile: string;
    /** Single transport mode. Use `transports` for multiple. */
    transport?: AppTransport;
    /** Supported transport modes (preferred over singular `transport`). */
    transports?: AppTransport[];
    /** Path to compiled server entry point. */
    entrypoint: string;
    /** Event types this app can emit. */
    events?: EventDeclaration[];
    /** Context bundle configuration. */
    context?: {
        /** How often the agent should refresh the context bundle (ms). */
        refreshIntervalMs?: number;
        /** Token budget for context bundle summaries. */
        maxTokens?: number;
    };
    /** @deprecated Use `context` instead. */
    contextBundle?: {
        refreshIntervalMs?: number;
    };
}
/** An event emitted by an app for agent consumption. */
export interface AppEvent {
    id?: string;
    app_name: string;
    event_name: string;
    /** Opaque string identifier — not necessarily a UUID. */
    user_id: string;
    payload: Record<string, unknown>;
    created_at?: string;
}
/** Compressed app state summary for the agent's context window. */
export interface ContextBundle {
    app_name: string;
    /** Opaque string identifier — not necessarily a UUID. */
    user_id: string;
    generated_at: string;
    /** Natural language summary (2–4 sentences, max 2000 chars). */
    summary: string;
    /** Structured key-value data the agent can reference. */
    data: Record<string, unknown>;
}
/**
 * Canonical error codes for tool failures. Agents branch on these instead of
 * parsing human-readable messages.
 *
 * - `not_found` — a referenced resource doesn't exist.
 * - `forbidden` — caller lacks permission for the requested resource or action.
 * - `rate_limited` — caller has exceeded a quota; retryable after a cooldown.
 * - `invalid_args` — parameters failed validation or semantic checks.
 * - `conflict` — the operation conflicts with existing state (e.g. already applied).
 * - `internal` — unexpected server-side failure. Usually retryable.
 */
export type AppToolErrorCode = "not_found" | "forbidden" | "rate_limited" | "invalid_args" | "conflict" | "internal";
/** Structured error payload attached to failing tool results. */
export interface AppToolError {
    code: AppToolErrorCode;
    /** Human-readable message (same or more specific than result.message). */
    message: string;
    /** Whether the agent can retry the same call and reasonably expect a different outcome. */
    retryable: boolean;
    /** Optional structured details for agents that want to reason about specifics. */
    details?: Record<string, unknown>;
}
/** Canonical result envelope returned by all MCP tools. */
export interface AppToolResult {
    ok: boolean;
    /** Human-readable message the agent can relay to the user. */
    message: string;
    data?: Record<string, unknown>;
    /** When true, the agent should re-fetch the context bundle before the next reasoning step. */
    contextInvalidated?: boolean;
    /** Structured error payload. Present iff `ok` is false. */
    error?: AppToolError;
}
/** Resolved identity for the current request. */
export interface AppIdentity {
    /** Opaque string identifier — not necessarily a UUID. */
    userId: string;
    scopes?: string[];
    /** Raw auth token claims for advanced use cases. */
    rawClaims?: Record<string, unknown>;
}
/**
 * Resolves a request into an app identity.
 * Return `null` to reject the request as unauthenticated.
 */
export type AuthResolver<TRequest = unknown> = (request: TRequest) => Promise<AppIdentity | null>;
/** Persistent event record with lease-based processing state. */
export interface AppEventRecord {
    id?: string;
    app_name: string;
    event_name: string;
    user_id: string;
    payload: Record<string, unknown>;
    /** App-defined key for deduplication. */
    dedupe_key?: string;
    status?: "pending" | "processing" | "processed";
    created_at?: string;
    claimed_at?: string | null;
    lease_expires_at?: string | null;
    processed_at?: string | null;
}
/** Adapter interface for event persistence (in-memory, Supabase, etc.). */
export interface EventStore {
    emit(event: Omit<AppEventRecord, "id" | "created_at">): Promise<AppEventRecord>;
    claimPending(userId: string, appName?: string): Promise<AppEventRecord[]>;
    markProcessed(eventId: string): Promise<void>;
}
/**
 * A composable unit of context bundle data.
 * Higher priority modules are kept when trimming to fit a token budget.
 */
export interface ContextModule<TDeps = unknown> {
    key: string;
    load: (deps: TDeps) => Promise<Record<string, unknown>>;
    summarize: (data: Record<string, unknown>) => string;
    /** Higher values = higher priority (kept first during budget trimming). */
    priority: number;
}
/** Decoded JWT payload fields. */
export interface AuthPayload {
    sub: string;
    email: string;
    iat: number;
    exp: number;
}
//# sourceMappingURL=types.d.ts.map