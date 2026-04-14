import type { SupabaseClient } from "@supabase/supabase-js";
import type { ToolResult } from "../types.js";

export function createCoachingTools(
  supabase: SupabaseClient,
  userId: string
) {
  async function send_coach_message(
    content: string,
    message_type: "chat" | "weekly_review" | "program_update" | "milestone" = "chat",
    week_number?: number,
    metadata?: Record<string, unknown>
  ): Promise<ToolResult> {
    const { data, error } = await supabase.rpc("send_agent_message", {
      p_user_id: userId,
      p_content: content,
      p_role: "agent",
      p_message_type: message_type,
      p_week_number: week_number ?? null,
      p_metadata: metadata ?? {},
    });

    if (error || !data?.success) {
      return {
        success: false,
        message: data?.error || error?.message || "Failed to send message.",
        data: {},
      };
    }

    return {
      success: true,
      message: `Message sent (type: ${message_type}).`,
      data: { message_id: data.message_id },
    };
  }

  async function get_user_messages(
    limit: number = 10,
    after_id?: string
  ): Promise<ToolResult> {
    const { data, error } = await supabase.rpc("get_unread_user_messages", {
      p_user_id: userId,
      p_limit: limit,
    });

    if (error) {
      return {
        success: false,
        message: error.message || "Failed to fetch user messages.",
        data: {},
      };
    }

    const messages = data || [];
    if (messages.length === 0) {
      return {
        success: true,
        message: "No unread messages from the user.",
        data: { messages: [] },
      };
    }

    const formatted = messages
      .map(
        (m: { content: string; message_created_at: string }) =>
          `[${new Date(m.message_created_at).toLocaleString()}] ${m.content}`
      )
      .join("\n\n");

    return {
      success: true,
      message: `${messages.length} unread message(s):\n\n${formatted}`,
      data: { messages, count: messages.length },
    };
  }

  async function get_conversation_history(
    limit: number = 50
  ): Promise<ToolResult> {
    const { data, error } = await supabase.rpc("get_agent_messages", {
      p_user_id: userId,
      p_limit: limit,
      p_before_id: null,
    });

    if (error) {
      return {
        success: false,
        message: error.message || "Failed to fetch conversation history.",
        data: {},
      };
    }

    const messages = (data || []).reverse(); // chronological order
    if (messages.length === 0) {
      return {
        success: true,
        message: "No conversation history yet.",
        data: { messages: [] },
      };
    }

    const formatted = messages
      .map(
        (m: { role: string; content: string; message_type: string; message_created_at: string }) =>
          `[${m.role}${m.message_type !== "chat" ? ` (${m.message_type})` : ""}] ${m.content}`
      )
      .join("\n\n");

    return {
      success: true,
      message: `${messages.length} message(s):\n\n${formatted}`,
      data: { messages, count: messages.length },
    };
  }

  return { send_coach_message, get_user_messages, get_conversation_history };
}
