import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
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
function registerTool(server, app, tool, requestContextFactory) {
    server.tool(tool.name, tool.description, tool.schema, async (params) => {
        const request = await requestContextFactory();
        const result = await tool.execute(params, { request, app });
        return toMcpResponse(result.message);
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
//# sourceMappingURL=server.js.map