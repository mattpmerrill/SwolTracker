import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { AppError, isAppError } from "./errors.js";
function createRequestContext(identity, transport) {
    return {
        identity,
        requestId: randomUUID(),
        transport,
    };
}
function toMcpResponse(text) {
    return { content: [{ type: "text", text }] };
}
/** Convert any thrown value into a canonical failing AppToolResult. */
export function toolResultFromThrown(error) {
    if (isAppError(error)) {
        return { ok: false, message: error.message, error: error.toToolError() };
    }
    const message = error instanceof Error ? error.message : "Unknown tool error";
    const envelope = { code: "internal", message, retryable: true };
    return { ok: false, message, error: envelope };
}
/** Ensure every ok: false result carries a structured error envelope. */
export function ensureErrorEnvelope(result) {
    if (result.ok || result.error)
        return result;
    return {
        ...result,
        error: { code: "internal", message: result.message, retryable: true },
    };
}
/**
 * Serialize a tool result into the single text payload the MCP text-only
 * renderer can transmit. Successful results pass their `message` through
 * unchanged; failures get JSON-encoded so agents can parse `error.code`.
 */
export function serializeResult(result) {
    if (result.ok)
        return result.message;
    const payload = {
        ok: false,
        message: result.message,
        error: result.error,
    };
    if (result.data !== undefined)
        payload.data = result.data;
    return JSON.stringify(payload);
}
/**
 * Return the subset of `tool.scopes` that `identity` does not hold.
 * Empty array means the identity covers all required scopes.
 * An undefined `identity.scopes` is treated as "no scopes granted" — fail closed.
 */
export function missingScopes(tool, identity) {
    const required = tool.scopes ?? [];
    if (required.length === 0)
        return [];
    const granted = new Set(identity.scopes ?? []);
    return required.filter((s) => !granted.has(s));
}
/**
 * Execute a tool with the standard request guards (scope enforcement) and error
 * envelope normalization. Returns a canonical `AppToolResult` for any outcome.
 * Exposed so both the registered MCP path and tests can exercise the same flow.
 */
export async function executeToolWithGuards(tool, params, context) {
    const missing = missingScopes(tool, context.request.identity);
    if (missing.length > 0) {
        return toolResultFromThrown(AppError.forbidden(`Missing required scope${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}`, { details: { tool: tool.name, required: tool.scopes, missing } }));
    }
    try {
        return ensureErrorEnvelope(await tool.execute(params, context));
    }
    catch (error) {
        return toolResultFromThrown(error);
    }
}
function registerTool(server, app, tool, requestContextFactory) {
    server.tool(tool.name, tool.description, tool.schema, async (params) => {
        const request = await requestContextFactory();
        const result = await executeToolWithGuards(tool, params, { request, app });
        return toMcpResponse(serializeResult(result));
    });
}
function createMcpServer(app, requestContextFactory) {
    const server = new McpServer({
        name: app.manifest.name,
        version: app.manifest.version,
    });
    for (const tool of app.tools) {
        registerTool(server, app, tool, requestContextFactory);
    }
    return server;
}
/**
 * Start an MCP server over stdio for local development.
 * Identity is resolved once at startup via `devIdentity`, `resolveDevIdentity`,
 * or the `BOT_NATIVE_USER_ID` env var.
 */
export async function createStdioServer(app, options = {}) {
    const identity = options.devIdentity ??
        (options.resolveDevIdentity
            ? await options.resolveDevIdentity()
            : { userId: process.env.BOT_NATIVE_USER_ID ?? "dev-user" });
    const server = createMcpServer(app, async () => createRequestContext(identity, "stdio"));
    const transport = new StdioServerTransport();
    await server.connect(transport);
    return { server, transport };
}
async function resolveHttpIdentity(app, req) {
    if (!app.authResolver)
        return null;
    return app.authResolver(req);
}
/**
 * Create an HTTP request handler for MCP over Streamable HTTP transport.
 * Rejects unauthenticated requests with 401 before touching MCP.
 */
export function createHttpHandler(app) {
    return async (req, res) => {
        if (req.method === "OPTIONS") {
            res.statusCode = 200;
            res.end();
            return;
        }
        if (req.method !== "POST") {
            res.statusCode = 405;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ error: "Method not allowed" }));
            return;
        }
        const identity = await resolveHttpIdentity(app, req);
        if (!identity) {
            res.statusCode = 401;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ error: "Unauthorized" }));
            return;
        }
        const server = createMcpServer(app, async () => createRequestContext(identity, "http"));
        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
        });
        try {
            await server.connect(transport);
            await transport.handleRequest(req, res, req);
        }
        catch (error) {
            if (!res.headersSent) {
                res.statusCode = 500;
                res.setHeader("content-type", "application/json");
                res.end(JSON.stringify({ error: handleToolError(error).message }));
            }
        }
        finally {
            await transport.close();
            await server.close();
        }
    };
}
/**
 * Start an HTTP MCP server as a long-running Node process.
 * Designed for production deployment behind a reverse proxy.
 */
export function createHttpServer(app, options = {}) {
    const handler = createHttpHandler(app);
    return createServer(handler).listen(options.port ?? 0, options.host ?? "127.0.0.1");
}
/** Normalize an error into an Error instance safe to return via MCP. */
export function handleToolError(error) {
    if (error instanceof Error)
        return new Error(error.message);
    return new Error("Unknown tool error");
}
