import { z } from "zod";
/** Zod schema for event declarations in the app manifest. */
export const eventDeclarationSchema = z.object({
    name: z.string().min(1),
    description: z.string().min(1),
    schema: z.record(z.unknown()).optional(),
});
/** Zod schema for `app.json` manifests. Strict mode rejects unknown fields. */
export const appManifestSchema = z
    .object({
    name: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    sdkVersion: z.string().regex(/^\d+\.\d+\.\d+$/).optional(),
    displayName: z.string().min(1).max(200),
    description: z.string().min(1).max(500),
    author: z.string().min(1).max(200),
    skillFile: z.string().default("./SKILL.md"),
    transport: z.enum(["stdio", "http", "sse"]).optional(),
    transports: z.array(z.enum(["stdio", "http", "sse"])).min(1).optional(),
    entrypoint: z.string().min(1),
    events: z.array(eventDeclarationSchema).optional(),
    context: z
        .object({
        refreshIntervalMs: z.number().int().positive().optional(),
        maxTokens: z.number().int().positive().optional(),
    })
        .optional(),
    contextBundle: z
        .object({
        refreshIntervalMs: z.number().int().positive().optional(),
    })
        .optional(),
})
    .strict()
    .refine((data) => data.transport !== undefined || data.transports !== undefined, {
    message: "Manifest must define transport or transports",
    path: ["transport"],
});
/** Zod schema for app events. */
export const appEventSchema = z.object({
    app_name: z.string().min(1),
    event_name: z.string().min(1),
    user_id: z.string().min(1),
    payload: z.record(z.unknown()),
});
/** Zod schema for context bundles. Summary capped at 2000 chars. */
export const contextBundleSchema = z.object({
    app_name: z.string().min(1),
    user_id: z.string().min(1),
    generated_at: z.string().datetime(),
    summary: z.string().min(1).max(2000),
    data: z.record(z.unknown()),
});
/**
 * Validate data against a Zod schema with a typed discriminated result.
 * @returns `{ success: true, data }` or `{ success: false, error }`.
 */
export function validate(schema, data) {
    const result = schema.safeParse(data);
    if (result.success)
        return { success: true, data: result.data };
    return {
        success: false,
        error: result.error.errors.map((e) => e.message).join(", "),
    };
}
//# sourceMappingURL=validation.js.map