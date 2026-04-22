import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateSkill } from "../contracts/skill.js";
/**
 * Create a bot-native app instance from a manifest, tools, and optional services.
 * The returned app can be passed to `createStdioServer` or `createHttpServer`.
 *
 * SKILL.md is parsed and validated at boot. If the file is missing or its
 * frontmatter fails the schema, this function throws and the app does not start.
 */
export function createBotNativeApp({ manifest, tools = [], eventStore, contextBundleLoader, skill: skillContent, skillRoot, }) {
    const skill = loadSkill(manifest, skillContent, skillRoot);
    return {
        manifest,
        tools,
        skill,
        eventStore,
        contextBundleLoader,
    };
}
function loadSkill(manifest, content, root) {
    if (content !== undefined) {
        return validateSkill(content);
    }
    const skillFile = manifest.skillFile;
    if (!skillFile) {
        throw new Error("createBotNativeApp: manifest has no `skillFile` and no `skill` content was provided.");
    }
    const path = resolve(root ?? process.cwd(), skillFile);
    if (!existsSync(path)) {
        throw new Error(`createBotNativeApp: SKILL.md not found at ${path}`);
    }
    return validateSkill(readFileSync(path, "utf8"));
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
