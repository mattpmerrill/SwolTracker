import { vi } from 'vitest';

/**
 * Minimal, chainable Supabase double. Every query builder method returns
 * the same `chain` object so calls like
 *   supabase.from(t).select().eq(a,b).single()
 * just work. Configure responses by table + terminator via `respond()`.
 *
 *   const sb = createMockSupabase();
 *   sb.respond('profiles', 'single', { data: { id: 'u1' }, error: null });
 *
 * Terminators: 'single', 'maybeSingle', 'list' (await on chain — `.then`).
 */
export function createMockSupabase() {
  const responses = new Map();
  const calls = [];

  const respond = (...args) => {
    if (args.length === 2) {
      const [key, value] = args;
      responses.set(key, value);
    } else {
      const [table, terminator, value] = args;
      responses.set(`${table}.${terminator}`, value);
    }
  };
  const get = (key) => (responses.has(key) ? responses.get(key) : { data: null, error: null });

  const makeChain = (table) => {
    const chain = {};
    const passthrough = (name) => vi.fn((...args) => { calls.push([table, name, args]); return chain; });
    for (const m of ['select', 'insert', 'update', 'upsert', 'delete', 'eq', 'in', 'neq', 'gte', 'lte', 'order', 'limit', 'range']) {
      chain[m] = passthrough(m);
    }
    chain.single = vi.fn(async () => get(`${table}.single`));
    chain.maybeSingle = vi.fn(async () => get(`${table}.maybeSingle`));
    chain.then = (resolve, reject) => Promise.resolve(get(`${table}.list`)).then(resolve, reject);
    return chain;
  };

  const from = vi.fn((table) => { calls.push([table, 'from', []]); return makeChain(table); });

  const rpc = vi.fn(async (fnName, args) => {
    calls.push(['rpc', fnName, args]);
    return get(`rpc.${fnName}`);
  });

  const storage = {
    from: vi.fn((bucket) => ({
      list: vi.fn(async () => ({ data: [], error: null })),
      remove: vi.fn(async () => ({ data: null, error: null })),
      upload: vi.fn(async () => ({ data: { path: `${bucket}/x` }, error: null })),
      getPublicUrl: vi.fn(() => ({ data: { publicUrl: `https://test/${bucket}/x` } })),
    })),
  };

  return { from, rpc, storage, calls, respond };
}
