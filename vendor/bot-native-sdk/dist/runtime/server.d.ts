import { type IncomingMessage, type Server as HttpServer, type ServerResponse } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { AppIdentity, AppToolResult } from "../contracts/types.js";
import type { BotNativeApp, DefinedTool, ToolExecutionContext } from "./tool.js";
export interface StdioServerOptions {
    /** Fixed identity for local development. */
    devIdentity?: AppIdentity;
    /** Async hook to resolve identity at startup (alternative to devIdentity). */
    resolveDevIdentity?: () => Promise<AppIdentity> | AppIdentity;
}
export interface HttpServerOptions {
    /** Port to listen on. Defaults to 0 (OS-assigned). */
    port?: number;
    /** Host to bind to. Defaults to "127.0.0.1". */
    host?: string;
}
/** Convert any thrown value into a canonical failing AppToolResult. */
export declare function toolResultFromThrown(error: unknown): AppToolResult;
/** Ensure every ok: false result carries a structured error envelope. */
export declare function ensureErrorEnvelope(result: AppToolResult): AppToolResult;
/**
 * Serialize a tool result into the single text payload the MCP text-only
 * renderer can transmit. Successful results pass their `message` through
 * unchanged; failures get JSON-encoded so agents can parse `error.code`.
 */
export declare function serializeResult(result: AppToolResult): string;
/**
 * Return the subset of `tool.scopes` that `identity` does not hold.
 * Empty array means the identity covers all required scopes.
 * An undefined `identity.scopes` is treated as "no scopes granted" — fail closed.
 */
export declare function missingScopes(tool: Pick<DefinedTool, "scopes">, identity: Pick<AppIdentity, "scopes">): string[];
/**
 * Execute a tool with the standard request guards (scope enforcement) and error
 * envelope normalization. Returns a canonical `AppToolResult` for any outcome.
 * Exposed so both the registered MCP path and tests can exercise the same flow.
 */
export declare function executeToolWithGuards(tool: DefinedTool, params: unknown, context: ToolExecutionContext): Promise<AppToolResult>;
/**
 * Start an MCP server over stdio for local development.
 * Identity is resolved once at startup via `devIdentity`, `resolveDevIdentity`,
 * or the `BOT_NATIVE_USER_ID` env var.
 */
export declare function createStdioServer(app: BotNativeApp, options?: StdioServerOptions): Promise<{
    server: McpServer;
    transport: StdioServerTransport;
}>;
/**
 * Create an HTTP request handler for MCP over Streamable HTTP transport.
 * Rejects unauthenticated requests with 401 before touching MCP.
 */
export declare function createHttpHandler(app: BotNativeApp): (req: IncomingMessage, res: ServerResponse) => Promise<void>;
/**
 * Start an HTTP MCP server as a long-running Node process.
 * Designed for production deployment behind a reverse proxy.
 */
export declare function createHttpServer(app: BotNativeApp, options?: HttpServerOptions): HttpServer;
/** Normalize an error into an Error instance safe to return via MCP. */
export declare function handleToolError(error: unknown): Error;
//# sourceMappingURL=server.d.ts.map