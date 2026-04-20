/**
 * Create a bot-native app instance from a manifest, tools, and optional services.
 * The returned app can be passed to `createStdioServer` or `createHttpServer`.
 */
export function createBotNativeApp({ manifest, tools = [], eventStore, contextBundleLoader, }) {
    return {
        manifest,
        tools,
        eventStore,
        contextBundleLoader,
    };
}
/**
 * Attach an auth resolver to an app for HTTP transport.
 * Returns a new app instance — does not mutate the original.
 */
export function withAuth(app, resolver) {
    return {
        ...app,
        authResolver: resolver,
    };
}
