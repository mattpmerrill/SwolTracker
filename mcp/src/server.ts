import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createEventEmitter } from "./bot-native-shim.js";
import { getSupabase } from "./db.js";
import { createQueryTools } from "./tools/queries.js";
import { createActionTools } from "./tools/actions.js";
import { createContextTools } from "./tools/context.js";
import { createNaturalLanguageTools } from "./tools/natural-language.js";
import { createGenerationTools } from "./tools/generation.js";
import { createCoachingTools } from "./tools/coaching.js";
import { createOnboardingTools } from "./tools/onboarding.js";
import { registerTools } from "./register-tools.js";

const supabase = getSupabase();
const userId =
  process.env.BOT_NATIVE_USER_ID ??
  "00000000-0000-0000-0000-000000000000";
const events = createEventEmitter(supabase, "swoltracker");

const queries = createQueryTools(supabase, userId);
const actions = createActionTools(supabase, userId, events, queries);
const context = createContextTools(supabase, userId, queries);
const nlTools = createNaturalLanguageTools(supabase, userId, queries, actions);
const generation = createGenerationTools(supabase, userId, queries, actions);
const coaching = createCoachingTools(supabase, userId);
const onboarding = createOnboardingTools(supabase, userId);

const server = new McpServer({
  name: "swoltracker",
  version: "0.1.0",
});

registerTools(server, queries, actions, context, nlTools, generation, coaching, onboarding);

// ── Start ────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
