import { describe, it, expect } from 'vitest';
import { createCoachingTools } from '../tools/coaching.js';
import { createMcpMockSupabase } from './mockSupabase.js';

describe('MCP coaching contract', () => {
  it('send_coach_message returns ToolResult with message_id on success', async () => {
    const sb = createMcpMockSupabase();
    sb.respond('rpc.send_agent_message', {
      data: { success: true, message_id: 'agent-msg-1' },
      error: null,
    });
    const tools = createCoachingTools(sb, 'u1');
    const result = await tools.send_coach_message('Nice session today', 'chat');
    expect(result.success).toBe(true);
    expect((result.data as any).message_id).toBe('agent-msg-1');
  });

  it('get_user_messages handles the no-unread case with a ToolResult', async () => {
    const sb = createMcpMockSupabase();
    sb.respond('rpc.get_unread_user_messages', { data: [], error: null });
    const tools = createCoachingTools(sb, 'u1');
    const result = await tools.get_user_messages();
    expect(result.success).toBe(true);
    expect(result.message).toContain('No unread messages');
    expect((result.data as any).messages).toEqual([]);
  });
});
