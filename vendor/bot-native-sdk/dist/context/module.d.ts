import type { ContextBundle, ContextModule } from "../contracts/types.js";
export interface BuildContextBundleOptions<TDeps> {
    appName: string;
    userId: string;
    modules: Array<ContextModule<TDeps>>;
    deps: TDeps;
    /** Token budget for the combined summary. Modules are trimmed lowest-priority-first. */
    maxTokens?: number;
}
/**
 * Build a context bundle by loading multiple modules in parallel, sorting by priority,
 * and optionally trimming to fit a token budget. Validates the final bundle shape.
 *
 * @throws If the resulting bundle fails schema validation (e.g. empty summary).
 */
export declare function buildContextBundleFromModules<TDeps>({ appName, userId, modules, deps, maxTokens, }: BuildContextBundleOptions<TDeps>): Promise<ContextBundle>;
//# sourceMappingURL=module.d.ts.map