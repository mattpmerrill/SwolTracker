import type { ContextBundle } from "../contracts/types.js";
/**
 * Build a context bundle from a pre-computed summary and data.
 * For module-based composition with priority trimming, use `buildContextBundleFromModules`.
 */
export declare function buildContextBundle(appName: string, userId: string, summary: string, data: Record<string, unknown>): ContextBundle;
//# sourceMappingURL=bundle.d.ts.map