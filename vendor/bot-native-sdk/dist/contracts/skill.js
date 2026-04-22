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
export const skillSchema = z
    .object({
    name: z
        .string()
        .min(1)
        .max(100)
        .regex(/^[a-z0-9-]+$/, "name must be kebab-case (lowercase letters, digits, hyphens)"),
    version: z.union([z.string().min(1), z.number()]),
    tone: z.string().min(1).max(100),
    capabilities: z.array(z.string().min(1)).min(1),
    limitations: z.array(z.string().min(1)).default([]),
    event_keys: z.array(z.string().min(1)).default([]),
    context_keys: z.array(z.string().min(1)).default([]),
    scopes: z.array(z.string().min(1)).default([]),
})
    .strict();
/** Thrown when a SKILL.md file is missing frontmatter or fails schema validation. */
export class SkillValidationError extends Error {
    constructor(message) {
        super(`Invalid SKILL.md: ${message}`);
        this.name = "SkillValidationError";
    }
}
/**
 * Extract the YAML-ish frontmatter block from a SKILL.md string.
 * Returns the body of the frontmatter (between `---` delimiters) or null if
 * no frontmatter is present.
 */
function extractFrontmatter(content) {
    const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content);
    return match ? match[1] : null;
}
function stripQuotes(value) {
    const t = value.trim();
    if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
        return t.slice(1, -1);
    }
    return t;
}
function parseScalar(value) {
    const t = stripQuotes(value);
    if (t === "true")
        return true;
    if (t === "false")
        return false;
    if (/^-?\d+(\.\d+)?$/.test(t))
        return Number(t);
    return t;
}
/**
 * Parse the frontmatter body into a raw record. Supports only the subset we
 * accept in SKILL.md schemas: top-level scalars and lists of strings.
 *
 * Exported for testing; prefer `validateSkill`.
 */
export function parseFrontmatter(body) {
    const lines = body.split(/\r?\n/);
    const out = {};
    let currentList = null;
    for (const rawLine of lines) {
        const line = rawLine.replace(/\s+$/, "");
        if (!line.trim()) {
            currentList = null;
            continue;
        }
        const listMatch = /^\s+-\s+(.*)$/.exec(line);
        if (listMatch && currentList) {
            currentList.push(stripQuotes(listMatch[1]));
            continue;
        }
        const kvMatch = /^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/.exec(line);
        if (!kvMatch) {
            throw new SkillValidationError(`frontmatter line not recognised: "${rawLine}"`);
        }
        const [, key, value] = kvMatch;
        if (value.length === 0) {
            currentList = [];
            out[key] = currentList;
        }
        else {
            currentList = null;
            out[key] = parseScalar(value);
        }
    }
    return out;
}
/**
 * Validate a SKILL.md file's frontmatter against the schema.
 * Throws `SkillValidationError` if frontmatter is missing, malformed, or
 * fails the schema. Returns the parsed, typed skill on success.
 */
export function validateSkill(content) {
    const body = extractFrontmatter(content);
    if (body === null) {
        throw new SkillValidationError("missing YAML frontmatter (file must start with a `---` delimited block)");
    }
    const raw = parseFrontmatter(body);
    const result = skillSchema.safeParse(raw);
    if (!result.success) {
        const reason = result.error.errors
            .map((e) => `${e.path.join(".") || "(root)"}: ${e.message}`)
            .join("; ");
        throw new SkillValidationError(reason);
    }
    return result.data;
}
