import { z } from "zod";
/**
 * Zod schema for the structured YAML frontmatter of a SKILL.md file.
 *
 * Frontmatter is the source-of-truth inventory an agent consults on connect:
 * - name/version pin the skill to its app
 * - capabilities/limitations tell the agent what to offer and what to decline
 * - tone shapes voice
 * - event_keys enumerate events the agent may receive
 * - context_keys enumerate the keys present in the app's ContextBundle
 * - scopes enumerate the permission scopes the app's tools may require
 */
export declare const skillSchema: z.ZodObject<{
    name: z.ZodString;
    version: z.ZodUnion<[z.ZodString, z.ZodNumber]>;
    tone: z.ZodString;
    capabilities: z.ZodArray<z.ZodString, "many">;
    limitations: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    event_keys: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    context_keys: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    scopes: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
}, "strict", z.ZodTypeAny, {
    name: string;
    version: string | number;
    tone: string;
    capabilities: string[];
    limitations: string[];
    event_keys: string[];
    context_keys: string[];
    scopes: string[];
}, {
    name: string;
    version: string | number;
    tone: string;
    capabilities: string[];
    limitations?: string[] | undefined;
    event_keys?: string[] | undefined;
    context_keys?: string[] | undefined;
    scopes?: string[] | undefined;
}>;
export type Skill = z.infer<typeof skillSchema>;
/** Thrown when a SKILL.md file is missing frontmatter or fails schema validation. */
export declare class SkillValidationError extends Error {
    constructor(message: string);
}
/**
 * Parse the frontmatter body into a raw record. Supports only the subset we
 * accept in SKILL.md schemas: top-level scalars and lists of strings.
 *
 * Exported for testing; prefer `validateSkill`.
 */
export declare function parseFrontmatter(body: string): Record<string, unknown>;
/**
 * Validate a SKILL.md file's frontmatter against the schema.
 * Throws `SkillValidationError` if frontmatter is missing, malformed, or
 * fails the schema. Returns the parsed, typed skill on success.
 */
export declare function validateSkill(content: string): Skill;
//# sourceMappingURL=skill.d.ts.map