import type { AppIdentity, AppManifest, ContextBundle, EventStore } from "../contracts/types.js";
import type { BotNativeApp, DefinedTool } from "./tool.js";
export interface CreateBotNativeAppOptions {
    manifest: AppManifest;
    tools?: Array<DefinedTool<any>>;
    eventStore?: EventStore;
    contextBundleLoader?: (identity: AppIdentity) => Promise<ContextBundle>;
    /**
     * Raw SKILL.md content. If omitted, the SDK reads `manifest.skillFile`
     * from disk (resolved relative to `skillRoot`, defaulting to CWD).
     * Validation throws `SkillValidationError` if frontmatter is missing or invalid.
     */
    skill?: string;
    /** Base dir for resolving `manifest.skillFile`. Defaults to `process.cwd()`. */
    skillRoot?: string;
}
/**
 * Create a bot-native app instance from a manifest, tools, and optional services.
 * The returned app can be passed to `createStdioServer` or `createHttpServer`.
 *
 * SKILL.md is parsed and validated at boot. If the file is missing or its
 * frontmatter fails the schema, this function throws and the app does not start.
 */
export declare function createBotNativeApp({ manifest, tools, eventStore, contextBundleLoader, skill: skillContent, skillRoot, }: CreateBotNativeAppOptions): BotNativeApp;
/**
 * Attach an auth resolver to an app for HTTP transport.
 * Returns a new app instance — does not mutate the original.
 */
export declare function withAuth<TRequest>(app: BotNativeApp, resolver: (request: TRequest) => Promise<AppIdentity | null>): BotNativeApp;
//# sourceMappingURL=app.d.ts.map