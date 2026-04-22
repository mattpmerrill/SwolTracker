import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
const TAG_DESCRIPTIONS = {
    query: "Read-only operations — safe to call without side effects.",
    action: "Writes that mutate state (logs, updates, saves).",
    edit: "Edits to existing records (corrections, substitutions).",
    meta: "Metadata utilities — app info, normalizers, catalogs.",
};
function toolInputSchema(tool) {
    const paramsObject = z.object(tool.schema);
    // Default target emits JSON Schema draft 7 / 2020-12 elements, which OpenAPI 3.1
    // accepts. `$refStrategy: "none"` inlines refs so each path is self-contained.
    const schema = zodToJsonSchema(paramsObject, { $refStrategy: "none" });
    // Strip the top-level `$schema` key (not meaningful inside an OpenAPI operation body).
    if (schema && typeof schema === "object" && "$schema" in schema) {
        const { $schema: _ignored, ...rest } = schema;
        return rest;
    }
    return schema;
}
function toolOperation(tool) {
    const op = {
        operationId: tool.name,
        summary: tool.description.split(".")[0].slice(0, 120),
        description: tool.description,
        tags: [tool.category],
        requestBody: {
            required: true,
            content: {
                "application/json": {
                    schema: toolInputSchema(tool),
                },
            },
        },
        responses: {
            "200": {
                description: "Tool result envelope. Check `ok` to distinguish success vs. structured failure.",
                content: {
                    "application/json": {
                        schema: { $ref: "#/components/schemas/AppToolResult" },
                    },
                },
            },
            "400": {
                description: "Invalid arguments — schema validation failed.",
                content: {
                    "application/json": {
                        schema: { $ref: "#/components/schemas/AppToolError" },
                    },
                },
            },
            "401": { description: "Missing or invalid bearer token." },
            "403": { description: "Authenticated, but caller is missing a required scope." },
            "429": { description: "Rate limit exceeded for this tool / category / user." },
        },
    };
    if (tool.scopes && tool.scopes.length > 0) {
        op.security = [{ bearerAuth: tool.scopes }];
        op["x-required-scopes"] = tool.scopes;
    }
    else {
        op.security = [{ bearerAuth: [] }];
    }
    return op;
}
const APP_TOOL_ERROR_SCHEMA = {
    type: "object",
    required: ["code", "message", "retryable"],
    properties: {
        code: {
            type: "string",
            enum: ["not_found", "forbidden", "invalid_args", "conflict", "rate_limited", "internal"],
            description: "Machine-readable error class. Maps to retry semantics and HTTP status.",
        },
        message: { type: "string", description: "Human-readable error description." },
        retryable: {
            type: "boolean",
            description: "Whether the caller can reasonably retry (true for rate_limited/internal).",
        },
        details: {
            type: "object",
            additionalProperties: true,
            description: "Optional structured context (e.g. { tool, required, missing } for forbidden).",
        },
    },
};
const APP_TOOL_RESULT_SCHEMA = {
    type: "object",
    required: ["ok", "message"],
    properties: {
        ok: { type: "boolean", description: "`true` for success, `false` if the tool returned a structured failure." },
        message: { type: "string", description: "Human-readable outcome. Safe to surface to the end user." },
        data: {
            type: "object",
            additionalProperties: true,
            description: "Tool-specific payload. Shape varies per tool — see each operation's description.",
        },
        error: { $ref: "#/components/schemas/AppToolError" },
        contextInvalidated: {
            type: "boolean",
            description: "If true, the agent's cached context bundle may be stale. Re-fetch before next turn.",
        },
    },
};
/**
 * Build an OpenAPI 3.1 document describing every tool registered on `app`.
 *
 * Each tool becomes `POST {serverUrl}/tools/{name}`. The actual MCP wire
 * protocol is JSON-RPC over a single `/api/mcp` endpoint — this document is a
 * browsable surface for humans and tooling (Swagger UI, Stoplight, Postman)
 * that treats each tool as a discrete operation.
 */
export function buildOpenApiDocument(app, options = {}) {
    const title = options.title ??
        app.manifest.displayName ??
        app.manifest.name;
    const version = options.version ?? app.manifest.version;
    const description = options.description ??
        app.manifest.description ??
        `MCP tool catalog for ${title}.`;
    const serverUrl = options.serverUrl ?? "/api/mcp";
    const paths = {};
    for (const tool of app.tools) {
        paths[`/tools/${tool.name}`] = { post: toolOperation(tool) };
    }
    const usedCategories = new Set(app.tools.map((t) => t.category));
    const tags = Array.from(usedCategories).map((cat) => ({
        name: cat,
        description: TAG_DESCRIPTIONS[cat],
    }));
    return {
        openapi: "3.1.0",
        info: { title, version, description },
        servers: [{ url: serverUrl, description: `${title} MCP endpoint` }],
        tags,
        paths,
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: "http",
                    scheme: "bearer",
                    bearerFormat: "API key",
                    description: "Bearer API key for the app (e.g. `Bearer swol_...`). Scopes listed per operation under `x-required-scopes`.",
                },
            },
            schemas: {
                AppToolResult: APP_TOOL_RESULT_SCHEMA,
                AppToolError: APP_TOOL_ERROR_SCHEMA,
            },
        },
    };
}
