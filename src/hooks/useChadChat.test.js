import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '../test/hookHarness.js';

vi.mock('react', async () => (await import('../test/hookHarness.js')).fakeReact);
vi.mock('../lib/supabase', () => ({ db: { getAllWorkoutPrograms: vi.fn() } }));
vi.mock('../lib/chad', () => ({ sendChadMessage: vi.fn(), sendChadDecision: vi.fn() }));

import { sendChadMessage } from '../lib/chad';
import { useChadChat } from './useChadChat';

const toast = { success: vi.fn(), error: vi.fn() };
const props = { currentUser: 'u1', programGymId: 'g1', setWorkoutProgram: vi.fn(), toast };

beforeEach(() => {
  sendChadMessage.mockReset();
  toast.error.mockReset();
});

describe('useChadChat.openWith', () => {
  it('opens the panel and sends the seeded message', async () => {
    sendChadMessage.mockResolvedValue({ reply: 'On it.', history: [], pending: null, changed: false });
    const view = renderHook(() => useChadChat(props));
    expect(view.result.current.isOpen).toBe(false);

    const ok = await view.result.current.openWith("Let's talk about my Week 3 check-in");

    expect(ok).toBe(true);
    expect(view.result.current.isOpen).toBe(true);
    expect(sendChadMessage).toHaveBeenCalledWith({ message: "Let's talk about my Week 3 check-in", history: [] });
    expect(view.result.current.messages.map((m) => m.role)).toEqual(['user', 'chad']);
    view.unmount();
  });

  it('still opens the panel when the send fails, and rolls the bubble back', async () => {
    sendChadMessage.mockRejectedValue(Object.assign(new Error('Chad hit a snag.'), { errorType: 'default' }));
    const view = renderHook(() => useChadChat(props));

    const ok = await view.result.current.openWith('hello');

    expect(ok).toBe(false);
    expect(view.result.current.isOpen).toBe(true);
    expect(view.result.current.messages).toEqual([]);
    view.unmount();
  });

  it('keeps open() working on its own', () => {
    const view = renderHook(() => useChadChat(props));
    view.result.current.open();
    expect(view.result.current.isOpen).toBe(true);
    view.result.current.close();
    expect(view.result.current.isOpen).toBe(false);
    view.unmount();
  });
});
