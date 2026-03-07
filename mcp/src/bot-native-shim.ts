/**
 * Inlined shim for @bot-native/core functions.
 * Removes the local file dependency so the MCP server can be used
 * both in stdio mode and from Vercel serverless functions.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// ── Event emitter ────────────────────────────────────────

interface AppEvent {
  app_name: string;
  event_name: string;
  user_id: string;
  payload: Record<string, unknown>;
}

export function createEventEmitter(supabase: SupabaseClient, appName: string) {
  return {
    async emit(
      eventName: string,
      userId: string,
      payload: Record<string, unknown>
    ): Promise<void> {
      const event: AppEvent = {
        app_name: appName,
        event_name: eventName,
        user_id: userId,
        payload,
      };
      const { error } = await supabase.from("app_events").insert(event);
      if (error) throw new Error(`Failed to emit event: ${error.message}`);
    },
  };
}

export type EventEmitter = ReturnType<typeof createEventEmitter>;

// ── Context bundle ───────────────────────────────────────

export interface ContextBundle {
  app_name: string;
  user_id: string;
  generated_at: string;
  summary: string;
  data: Record<string, unknown>;
}

export function buildContextBundle(
  appName: string,
  userId: string,
  summary: string,
  data: Record<string, unknown>
): ContextBundle {
  return {
    app_name: appName,
    user_id: userId,
    generated_at: new Date().toISOString(),
    summary,
    data,
  };
}
