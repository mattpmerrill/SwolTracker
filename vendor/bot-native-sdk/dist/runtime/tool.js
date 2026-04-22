/**
 * Define an MCP tool with typed parameters and automatic `contextInvalidated` defaults.
 * Action and edit tools default to `contextInvalidated: true`; query and meta default to `false`.
 * The handler can override this by returning an explicit `contextInvalidated` value.
 */
export function defineTool({ name, description, category = "query", schema, scopes, execute, }) {
    return {
        name,
        description,
        category,
        schema,
        ...(scopes ? { scopes } : {}),
        async execute(params, ctx) {
            const result = await execute(params, ctx);
            return {
                ...result,
                contextInvalidated: result.contextInvalidated ?? (category === "action" || category === "edit"),
            };
        },
    };
}
