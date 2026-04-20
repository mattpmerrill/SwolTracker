import { contextBundleSchema, validate } from "../contracts/validation.js";
function estimateTokens(text) {
    return Math.ceil(text.length / 4);
}
/**
 * Build a context bundle by loading multiple modules in parallel, sorting by priority,
 * and optionally trimming to fit a token budget. Validates the final bundle shape.
 *
 * @throws If the resulting bundle fails schema validation (e.g. empty summary).
 */
export async function buildContextBundleFromModules({ appName, userId, modules, deps, maxTokens, }) {
    const loaded = await Promise.all(modules.map(async (module) => {
        const data = await module.load(deps);
        return {
            key: module.key,
            priority: module.priority,
            summary: module.summarize(data),
            data,
        };
    }));
    loaded.sort((a, b) => b.priority - a.priority);
    let included = loaded;
    if (maxTokens !== undefined) {
        included = [];
        let currentTokens = 0;
        const trimmed = [];
        for (const entry of loaded) {
            const entryTokens = estimateTokens(entry.summary);
            const separatorTokens = included.length > 0 ? 1 : 0;
            if (currentTokens + entryTokens + separatorTokens <= maxTokens) {
                included.push(entry);
                currentTokens += entryTokens + separatorTokens;
            }
            else {
                trimmed.push(entry.key);
            }
        }
        if (trimmed.length > 0) {
            console.warn(`Context budget exceeded (${maxTokens} tokens). Trimmed modules: ${trimmed.join(", ")}`);
        }
    }
    const summary = included.map((entry) => entry.summary).join(" ");
    const data = Object.assign({}, ...included.map((entry) => entry.data));
    const bundle = {
        app_name: appName,
        user_id: userId,
        generated_at: new Date().toISOString(),
        summary,
        data,
    };
    const result = validate(contextBundleSchema, bundle);
    if (!result.success) {
        throw new Error(`Invalid context bundle: ${result.error}`);
    }
    return bundle;
}
