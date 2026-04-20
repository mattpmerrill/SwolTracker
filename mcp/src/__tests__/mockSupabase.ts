import { vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Minimal chainable Supabase double for MCP tool contract tests.
 * Register table-level terminator responses:
 *   sb.respond('profiles.single', { data: {...}, error: null });
 *   sb.respond('current_user_maxes.list', { data: [...], error: null });
 * Register rpc responses:
 *   sb.respond('rpc.send_agent_message', { data: {...}, error: null });
 */
export function createMcpMockSupabase() {
  const responses = new Map<string, any>();
  const calls: Array<[string, string, any[]]> = [];

  const respond = (key: string, value: any) => {
    responses.set(key, value);
  };

  const get = (key: string) =>
    responses.has(key) ? responses.get(key) : { data: null, error: null };

  const makeChain = (table: string) => {
    const chain: any = {};
    const passthrough = (name: string) =>
      vi.fn((...args: any[]) => {
        calls.push([table, name, args]);
        return chain;
      });
    for (const m of [
      'select',
      'insert',
      'update',
      'upsert',
      'delete',
      'eq',
      'in',
      'neq',
      'gte',
      'lte',
      'order',
      'limit',
      'range',
      'is',
    ]) {
      chain[m] = passthrough(m);
    }
    chain.single = vi.fn(async () => get(`${table}.single`));
    chain.maybeSingle = vi.fn(async () => get(`${table}.maybeSingle`));
    chain.then = (resolve: any, reject: any) =>
      Promise.resolve(get(`${table}.list`)).then(resolve, reject);
    return chain;
  };

  const from = vi.fn((table: string) => {
    calls.push([table, 'from', []]);
    return makeChain(table);
  });

  const rpc = vi.fn(async (fnName: string, args?: any) => {
    calls.push(['rpc', fnName, args ? [args] : []]);
    return get(`rpc.${fnName}`);
  });

  const sb = { from, rpc, calls, respond };
  return sb as typeof sb & SupabaseClient;
}
