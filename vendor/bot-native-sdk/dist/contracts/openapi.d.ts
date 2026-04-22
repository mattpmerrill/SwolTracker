import type { BotNativeApp } from "../runtime/tool.js";
/**
 * Shape of an OpenAPI 3.1 document emitted by `buildOpenApiDocument`.
 * Loosely typed — we lean on linters/renderers to check structural correctness.
 */
export interface OpenApiDocument {
    openapi: "3.1.0";
    info: {
        title: string;
        version: string;
        description: string;
    };
    servers: Array<{
        url: string;
        description?: string;
    }>;
    tags?: Array<{
        name: string;
        description: string;
    }>;
    paths: Record<string, Record<string, unknown>>;
    components: {
        securitySchemes: Record<string, unknown>;
        schemas: Record<string, unknown>;
    };
}
export interface BuildOpenApiOptions {
    /** Override `info.title`. Defaults to `manifest.displayName ?? manifest.name`. */
    title?: string;
    /** Override `info.version`. Defaults to `manifest.version`. */
    version?: string;
    /** Override `info.description`. Defaults to `manifest.description`. */
    description?: string;
    /**
     * Where the tools are actually served. Defaults to `/api/mcp`; each tool becomes
     * `POST {serverUrl}/tools/{name}`. OpenAPI 3.1 servers[] must be absolute or
     * relative; both work with Swagger UI.
     */
    serverUrl?: string;
}
/**
 * Build an OpenAPI 3.1 document describing every tool registered on `app`.
 *
 * Each tool becomes `POST {serverUrl}/tools/{name}`. The actual MCP wire
 * protocol is JSON-RPC over a single `/api/mcp` endpoint — this document is a
 * browsable surface for humans and tooling (Swagger UI, Stoplight, Postman)
 * that treats each tool as a discrete operation.
 */
export declare function buildOpenApiDocument(app: BotNativeApp, options?: BuildOpenApiOptions): OpenApiDocument;
//# sourceMappingURL=openapi.d.ts.map