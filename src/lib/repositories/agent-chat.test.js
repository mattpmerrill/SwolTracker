import { describe, it, expect } from 'vitest';
import { createAgentChatRepo } from './agent-chat';
import { createMockSupabase } from '../../test/mockSupabase';

describe('agentChatRepo', () => {
  it('getAgentMessages returns rpc rows', async () => {
    const sb = createMockSupabase();
    sb.respond('rpc.get_agent_messages', {
      data: [{ id: 'm1', role: 'agent', content: 'hi' }],
      error: null,
    });
    const repo = createAgentChatRepo(sb);
    const msgs = await repo.getAgentMessages('u1');
    expect(msgs).toHaveLength(1);
    expect(msgs[0].role).toBe('agent');
  });

  it('sendUserMessage returns rpc data', async () => {
    const sb = createMockSupabase();
    sb.respond('rpc.send_agent_message', { data: 'new-msg-id', error: null });
    const repo = createAgentChatRepo(sb);
    const id = await repo.sendUserMessage('u1', 'Hello coach');
    expect(id).toBe('new-msg-id');
  });

  it('deleteAgentMessage returns true on success', async () => {
    const sb = createMockSupabase();
    const repo = createAgentChatRepo(sb);
    const ok = await repo.deleteAgentMessage('u1', 'm1');
    expect(ok).toBe(true);
  });
});
