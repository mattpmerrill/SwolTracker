import type { z } from "zod";
import type { AppIdentity, AppManifest, AppToolResult, ContextBundle, EventStore } from "../contracts/types.js";
/** Tool behavior category — affects default `contextInvalidated` value. */
export type ToolCategory = "query" | "action" | "edit" | "meta";
/** Per-request context injected into every tool execution. */
export interface RequestContext {
    identity: AppIdentity;
    requestId: string;
    transport: "stdio" | "http";
}
/** Full context passed to a tool's execute function. */
export interface ToolExecutionContext {
    request: RequestContext;
    app: BotNativeApp;
}
/** A fully configured tool ready for MCP server registration. */
export interface DefinedTool<TParams = unknown> {
    name: string;
    description: string;
    category: ToolCategory;
    schema: z.ZodRawShape;
    execute: (params: TParams, ctx: ToolExecutionContext) => Promise<AppToolResult>;
}
/** The app instance that tools, servers, and services attach to. */
export interface BotNativeApp {
    manifest: AppManifest;
    tools: Array<DefinedTool<any>>;
    authResolver?: (request: unknown) => Promise<AppIdentity | null>;
    eventStore?: EventStore;
    contextBundleLoader?: (identity: AppIdentity) => Promise<ContextBundle>;
}
export interface DefineToolOptions<TParams> {
    name: string;
    description: string;
    /** Defaults to "query". Actions and edits default `contextInvalidated` to true. */
    category?: ToolCategory;
    schema: z.ZodRawShape;
    execute: (params: TParams, ctx: ToolExecutionContext) => Promise<AppToolResult>;
}
/**
 * Define an MCP tool with typed parameters and automatic `contextInvalidated` defaults.
 * Action and edit tools default to `contextInvalidated: true`; query and meta default to `false`.
 * The handler can override this by returning an explicit `contextInvalidated` value.
 */
export declare function defineTool<TParams>({ name, description, category, schema, execute, }: DefineToolOptions<TParams>): DefinedTool<TParams>;
//# sourceMappingURL=tool.d.ts.map