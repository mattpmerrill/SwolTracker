import { z } from "zod";
/** Zod schema for event declarations in the app manifest. */
export declare const eventDeclarationSchema: z.ZodObject<{
    name: z.ZodString;
    description: z.ZodString;
    schema: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    name: string;
    description: string;
    schema?: Record<string, unknown> | undefined;
}, {
    name: string;
    description: string;
    schema?: Record<string, unknown> | undefined;
}>;
/** Zod schema for `app.json` manifests. Strict mode rejects unknown fields. */
export declare const appManifestSchema: z.ZodEffects<z.ZodObject<{
    name: z.ZodString;
    version: z.ZodString;
    sdkVersion: z.ZodOptional<z.ZodString>;
    displayName: z.ZodString;
    description: z.ZodString;
    author: z.ZodString;
    skillFile: z.ZodDefault<z.ZodString>;
    transport: z.ZodOptional<z.ZodEnum<["stdio", "http", "sse"]>>;
    transports: z.ZodOptional<z.ZodArray<z.ZodEnum<["stdio", "http", "sse"]>, "many">>;
    entrypoint: z.ZodString;
    events: z.ZodOptional<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        description: z.ZodString;
        schema: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        description: string;
        schema?: Record<string, unknown> | undefined;
    }, {
        name: string;
        description: string;
        schema?: Record<string, unknown> | undefined;
    }>, "many">>;
    context: z.ZodOptional<z.ZodObject<{
        refreshIntervalMs: z.ZodOptional<z.ZodNumber>;
        maxTokens: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        refreshIntervalMs?: number | undefined;
        maxTokens?: number | undefined;
    }, {
        refreshIntervalMs?: number | undefined;
        maxTokens?: number | undefined;
    }>>;
    contextBundle: z.ZodOptional<z.ZodObject<{
        refreshIntervalMs: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        refreshIntervalMs?: number | undefined;
    }, {
        refreshIntervalMs?: number | undefined;
    }>>;
}, "strict", z.ZodTypeAny, {
    name: string;
    description: string;
    version: string;
    displayName: string;
    author: string;
    skillFile: string;
    entrypoint: string;
    sdkVersion?: string | undefined;
    transport?: "stdio" | "http" | "sse" | undefined;
    transports?: ("stdio" | "http" | "sse")[] | undefined;
    events?: {
        name: string;
        description: string;
        schema?: Record<string, unknown> | undefined;
    }[] | undefined;
    context?: {
        refreshIntervalMs?: number | undefined;
        maxTokens?: number | undefined;
    } | undefined;
    contextBundle?: {
        refreshIntervalMs?: number | undefined;
    } | undefined;
}, {
    name: string;
    description: string;
    version: string;
    displayName: string;
    author: string;
    entrypoint: string;
    sdkVersion?: string | undefined;
    skillFile?: string | undefined;
    transport?: "stdio" | "http" | "sse" | undefined;
    transports?: ("stdio" | "http" | "sse")[] | undefined;
    events?: {
        name: string;
        description: string;
        schema?: Record<string, unknown> | undefined;
    }[] | undefined;
    context?: {
        refreshIntervalMs?: number | undefined;
        maxTokens?: number | undefined;
    } | undefined;
    contextBundle?: {
        refreshIntervalMs?: number | undefined;
    } | undefined;
}>, {
    name: string;
    description: string;
    version: string;
    displayName: string;
    author: string;
    skillFile: string;
    entrypoint: string;
    sdkVersion?: string | undefined;
    transport?: "stdio" | "http" | "sse" | undefined;
    transports?: ("stdio" | "http" | "sse")[] | undefined;
    events?: {
        name: string;
        description: string;
        schema?: Record<string, unknown> | undefined;
    }[] | undefined;
    context?: {
        refreshIntervalMs?: number | undefined;
        maxTokens?: number | undefined;
    } | undefined;
    contextBundle?: {
        refreshIntervalMs?: number | undefined;
    } | undefined;
}, {
    name: string;
    description: string;
    version: string;
    displayName: string;
    author: string;
    entrypoint: string;
    sdkVersion?: string | undefined;
    skillFile?: string | undefined;
    transport?: "stdio" | "http" | "sse" | undefined;
    transports?: ("stdio" | "http" | "sse")[] | undefined;
    events?: {
        name: string;
        description: string;
        schema?: Record<string, unknown> | undefined;
    }[] | undefined;
    context?: {
        refreshIntervalMs?: number | undefined;
        maxTokens?: number | undefined;
    } | undefined;
    contextBundle?: {
        refreshIntervalMs?: number | undefined;
    } | undefined;
}>;
/** Zod schema for app events. */
export declare const appEventSchema: z.ZodObject<{
    app_name: z.ZodString;
    event_name: z.ZodString;
    user_id: z.ZodString;
    payload: z.ZodRecord<z.ZodString, z.ZodUnknown>;
}, "strip", z.ZodTypeAny, {
    app_name: string;
    event_name: string;
    user_id: string;
    payload: Record<string, unknown>;
}, {
    app_name: string;
    event_name: string;
    user_id: string;
    payload: Record<string, unknown>;
}>;
/** Zod schema for context bundles. Summary capped at 2000 chars. */
export declare const contextBundleSchema: z.ZodObject<{
    app_name: z.ZodString;
    user_id: z.ZodString;
    generated_at: z.ZodString;
    summary: z.ZodString;
    data: z.ZodRecord<z.ZodString, z.ZodUnknown>;
}, "strip", z.ZodTypeAny, {
    app_name: string;
    user_id: string;
    generated_at: string;
    summary: string;
    data: Record<string, unknown>;
}, {
    app_name: string;
    user_id: string;
    generated_at: string;
    summary: string;
    data: Record<string, unknown>;
}>;
/**
 * Validate data against a Zod schema with a typed discriminated result.
 * @returns `{ success: true, data }` or `{ success: false, error }`.
 */
export declare function validate<T>(schema: z.ZodSchema<T>, data: unknown): {
    success: true;
    data: T;
} | {
    success: false;
    error: string;
};
//# sourceMappingURL=validation.d.ts.map