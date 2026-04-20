/**
 * Build a context bundle from a pre-computed summary and data.
 * For module-based composition with priority trimming, use `buildContextBundleFromModules`.
 */
export function buildContextBundle(appName, userId, summary, data) {
    return {
        app_name: appName,
        user_id: userId,
        generated_at: new Date().toISOString(),
        summary,
        data,
    };
}
//# sourceMappingURL=bundle.js.map