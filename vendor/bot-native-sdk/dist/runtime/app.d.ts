import type { AppIdentity, AppManifest, ContextBundle, EventStore } from "../contracts/types.js";
import type { BotNativeApp, DefinedTool } from "./tool.js";
export interface CreateBotNativeAppOptions {
    manifest: AppManifest;
    tools?: Array<DefinedTool<any>>;
    eventStore?: EventStore;
    contextBundleLoader?: (identity: AppIdentity) => Promise<ContextBundle>;
}
/**
 * Create a bot-native app instance from a manifest, tools, and optional services.
 * The returned app can be passed to `createStdioServer` or `createHttpServer`.
 */
export declare function createBotNativeApp({ manifest, tools, eventStore, contextBundleLoader, }: CreateBotNativeAppOptions): BotNativeApp;
/**
 * Attach an auth resolver to an app for HTTP transport.
 * Returns a new app instance — does not mutate the original.
 */
export declare function withAuth<TRequest>(app: BotNativeApp, resolver: (request: TRequest) => Promise<AppIdentity | null>): BotNativeApp;
//# sourceMappingURL=app.d.ts.map